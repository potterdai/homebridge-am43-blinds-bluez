import { EventEmitter } from "events"
import { buildCommandBuffer } from "./utils/commands"
import {
  DeviceValues,
  DIRECTION,
  NOTIFICATION_TO_EVENT,
  PRIMARY_SERVICE_ID,
} from "./utils/values"
import Debug from "debug"
import { PerDeviceConfig } from "./types"
import { ble } from "./utils/ble"
import { Device } from "node-ble"
import { Logger } from "homebridge"

const ACK_TIMEOUT = 1000
const debug = Debug("AM43")

export class AM43Device extends EventEmitter {
  private uuid: string
  private config: PerDeviceConfig
  private primaryServiceUUID: string
  private controlCharacteristicUUID: string
  private notificationCallback: ((data: Buffer) => void) | undefined
  tiltMotor: AM43Device | null
  private log: Logger

  name: string
  id: string
  // address: string
  // isConnected: boolean
  position: number
  targetPosition: number | null
  tilt: number | null
  targetTilt: number | null
  batteryPercentage: number
  hasRunFirstConnect: boolean

  constructor({
    uuid,
    config,
    interactionTimeout,
    log,
  }: {
    uuid: string
    config: PerDeviceConfig
    interactionTimeout: number
    log: Logger
  }) {
    super()
    this.config = config
    this.uuid = this.id = uuid
    this.name = config.name ?? `AM43 Blind: ${uuid}`
    this.hasRunFirstConnect = false
    this.batteryPercentage = 50
    this.position = 50
    this.targetPosition = null
    this.primaryServiceUUID = ""
    this.controlCharacteristicUUID = ""
    this.log = log
    this.tiltMotor = null
    this.tilt = null
    this.targetTilt = null
  }

  async firstConnect(): Promise<boolean> {
    const { device } = await ble.connectToDevice(this.uuid)
    const name = await device.getName()
    this.name = name
    this.log.info(`Connected - ${this.description}`)

    await this.setupLongUUIDs()
    await this.subscribeToNotifications()

    if (this.config.pass_code) {
      try {
        await this.authWithPassCode(this.config.pass_code)
      } catch (err) {
        this.log.error(`Passcode auth failed for ${this.description}`)
      }
    }
    this.hasRunFirstConnect = true
    return true
  }

  addTiltMotor(subDevice: AM43Device) {
    this.tiltMotor = subDevice
    this.tiltMotor.on("ble:position", (position: number) => {
      if (this.config.has_tilt) {
        const tilt = Math.round((position / 100) * 180 - 90)
        this.tilt = tilt
        this.emit("tilt", tilt)
      }
    })
  }

  get description() {
    return `${this.name} : ${this.uuid}`
  }

  async setTilt(tilt: number): Promise<boolean> {
    this.targetTilt = tilt
    const position = ((tilt + 90) / 180) * 100
    if (!this.tiltMotor) return false
    return await this.tiltMotor.setPosition(position)
  }

  private async subscribeToNotifications() {
    this.notificationCallback = (data: Buffer) => {
      const eventName = NOTIFICATION_TO_EVENT[data.toString("hex")]
      if (eventName) this.emit(`ble:${eventName}`)

      switch (data[1]) {
        case DeviceValues.AM43_COMMAND_PASSCODE:
          this.emit("ble:auth", data[3] === DeviceValues.AM43_RESPONSE_ACK)
          break
        case DeviceValues.AM43_COMMAND_ID_GET_POSITION:
          this.position = data[5]
          this.log.debug(`${this.name} - GET_POSITION ${this.position}`)
          this.emit("ble:position", this.position)
          break

        case DeviceValues.AM43_COMMAND_ID_GET_BATTERYSTATUS:
          const batteryPercentage = data[7]
          this.batteryPercentage = batteryPercentage
          this.emit("ble:battery", this.batteryPercentage)
          break

        case DeviceValues.AM43_NOTIFY_POSITION:
          const position = data[4]
          this.log.debug(`${this.name} - NOTIFY_POSITION ${position}`)
          this.position = position
          this.emit("ble:position", this.position)
          break

        case DeviceValues.AM43_COMMAND_ID_SET_MOVE:
          this.log.debug(`${this.name} - Set move notify received`)
          if (data[3] == DeviceValues.AM43_RESPONSE_ACK) {
            this.log.debug(`${this.name} - ACK`)
          } else if (data[3] == DeviceValues.AM43_RESPONSE_NACK) {
            this.log.debug(`${this.name} - NACK`)
          }
          break

        case DeviceValues.AM43_COMMAND_ID_SET_POSITION:
          this.log.debug(
            `${this.name} - Set position notify received ${
              data[3] == DeviceValues.AM43_RESPONSE_ACK
            }`
          )
          this.emit(
            "ble:position_set",
            data[3] === DeviceValues.AM43_RESPONSE_ACK
          )
          break

        default:
          break
      }
    }

    await ble.subscribe(
      this.uuid,
      this.primaryServiceUUID,
      this.controlCharacteristicUUID,
      this.notificationCallback
    )
  }

  async reconnect() {
    ble.connectToDevice(this.uuid).then(async ({ device }) => {
      this.log.info(`Connected - ${this.description}`)
      await this.subscribeToNotifications()
      if (this.config.pass_code) {
        try {
          await this.authWithPassCode(this.config.pass_code)
        } catch (err) {
          this.log.error(`Passcode auth failed for ${this.description}`)
        }
      }
    })
  }

  async disconnect() {
    await this.unsubscribeToNotifications()
    await ble.disconnectDevice(this.uuid)
  }

  private async unsubscribeToNotifications() {
    if (this.notificationCallback)
      await ble.unsubscribe(this.notificationCallback)
  }

  private async setupLongUUIDs() {
    const uuids = await ble.getServiceAndCharacteristicUUIDs(this.uuid)
    this.primaryServiceUUID = uuids.serviceUUID
    this.controlCharacteristicUUID = uuids.characteristicUUID
  }

  async authWithPassCode(passcode: string): Promise<boolean> {
    // await new Promise((resolve) => setTimeout(resolve, 250))
    const data16Bit = new Uint16Array([parseInt(passcode)])
    const data = new Uint8Array(data16Bit.buffer).reverse()
    this.log.info("Authing...")
    return new Promise((resolve, reject) => {
      ble.writeValue(
        this.uuid,
        this.primaryServiceUUID,
        this.controlCharacteristicUUID,
        buildCommandBuffer(DeviceValues.AM43_COMMAND_PASSCODE, data)
      )

      this.callbackOrTimeout(
        "ble:auth",
        (success: boolean) => {
          if (success) {
            resolve(true)
          } else {
            resolve(false)
          }
        },
        () => {
          this.log.error("Auth Timeout...")
          reject()
        }
      )
    })
  }

  callbackOrTimeout(
    once: "ble:position",
    successCallback: (position: number) => void,
    timeoutCallback: () => void
  ): void
  callbackOrTimeout(
    once: "ble:auth" | "ble:position_set",
    successCallback: (success: boolean) => void,
    timeoutCallback: () => void
  ): void
  callbackOrTimeout(
    once: "ble:battery",
    successCallback: (percentage: number) => void,
    timeoutCallback: () => void
  ): void
  callbackOrTimeout(
    once: string,
    successCallback: (...args: any[]) => void,
    timeoutCallback: () => void
  ) {
    const callback = (...args: any[]) => {
      clearTimeout(timeout)
      successCallback(...args)
    }
    this.once(once, callback)
    const timeout = setTimeout(() => {
      this.removeListener(once, callback)
      timeoutCallback()
    }, ACK_TIMEOUT)
  }

  async updatePosition(): Promise<number | false> {
    if (!this.hasRunFirstConnect) return 0

    return new Promise((resolve, reject) => {
      ble.writeValue(
        this.uuid,
        this.primaryServiceUUID,
        this.controlCharacteristicUUID,
        buildCommandBuffer(DeviceValues.AM43_COMMAND_ID_GET_POSITION, [0x1])
      )

      this.callbackOrTimeout(
        "ble:position",
        (position: number) => resolve(position),
        () => resolve(false)
      )
    })
  }

  async updateTilt(): Promise<number | false> {
    if (!this.hasRunFirstConnect) return 0

    const tiltPosition = await this.tiltMotor?.updatePosition()
    if (tiltPosition === false || tiltPosition === undefined) return false
    const tilt = Math.round((tiltPosition / 100) * 180 - 90)
    this.tilt = tilt
    return tilt
  }

  async updateBatteryStatus(): Promise<number | false> {
    if (!this.hasRunFirstConnect) return 0

    return new Promise((resolve, reject) => {
      ble.writeValue(
        this.uuid,
        this.primaryServiceUUID,
        this.controlCharacteristicUUID,
        buildCommandBuffer(DeviceValues.AM43_COMMAND_ID_GET_BATTERYSTATUS, [
          0x1,
        ])
      )

      this.callbackOrTimeout(
        "ble:battery",
        (percentage: number) => resolve(percentage),
        () => resolve(false)
      )
    })
  }

  getDirection() {
    const NUMBER_FUDGE = 4

    const closeEnough =
      this.targetPosition &&
      this.position > this.targetPosition - NUMBER_FUDGE / 2 &&
      this.position < this.targetPosition + NUMBER_FUDGE / 2
    this.log.debug(
      `getDirection ${closeEnough} ${this.targetPosition} ${this.position}`
    )
    if (!this.targetPosition || closeEnough) return DIRECTION.STOP
    if (this.targetPosition < this.position) return DIRECTION.OPEN
    if (this.targetPosition > this.position) return DIRECTION.CLOSE
  }

  async setPosition(target: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.targetPosition = target
      ble.writeValue(
        this.uuid,
        this.primaryServiceUUID,
        this.controlCharacteristicUUID,
        buildCommandBuffer(DeviceValues.AM43_COMMAND_ID_SET_POSITION, [target])
      )

      this.callbackOrTimeout(
        "ble:position_set",
        (success: boolean) => resolve(success),
        () => resolve(false)
      )
    })
  }
}

/*

class AM43Device extends EventEmitter {
  // private peripheral: noble.Peripheral
  private connectingPromise: null | Promise<void>
  // private discoveringPromise: null | Promise<noble.ServicesAndCharacteristics>
  // private blindsControlCharacteristic: null | noble.Characteristic
  private positionHistory: number[]
  private interactionTimeout: number
  private disconnectTimeout: NodeJS.Timeout | null

  // name: string
  id: string
  address: string
  description: string
  isConnected: boolean
  position: number
  targetPosition: null | number
  direction: 0 | 1 | 2
  batteryPercentage: number
  config: PerDeviceConfig

  constructor(
    // peripheral: noble.Peripheral,
    config: PerDeviceConfig,
    interactionTimeout: number
  ) {
    super()

    // this.peripheral = peripheral
    this.config = config
    // this.name =
    //   peripheral.advertisement?.localName ||
    //   peripheral.address ||
    //   `AM43 Blind ${peripheral.id}`

    this.id =
      peripheral.id || peripheral.uuid || peripheral.address || this.name

    this.address = peripheral.address

    let addressDesc =
      this.peripheral.address != null
        ? this.peripheral.address
        : this.peripheral.id
    this.description = `${this.name} (${addressDesc})`

    this.interactionTimeout = interactionTimeout
    this.disconnectTimeout = null

    this.isConnected = false
    this.peripheral.on("connect", () => {
      this.debugLog(`Device connected: ${this.id}`)
      this.isConnected = true
    })
    this.peripheral.on("disconnect", () => {
      this.debugLog(`Device disconnected: ${this.id}`)
      this.connectingPromise = null
      this.discoveringPromise = null
      this.blindsControlCharacteristic = null
      this.isConnected = false
    })
    this.blindsControlCharacteristic = null
    this.position = 0
    this.targetPosition = null
    this.direction = 2 // 0: Down/Decreating, 1: Up/Increasing, 2: Stopped
    this.batteryPercentage = 50

    this.positionHistory = []

    this.connectingPromise = null
    this.discoveringPromise = null

    this.startDisconnectTimeout()
  }

  debugLog(info: string) {
    debug(`${this.description}: ${info}`)
  }

  setBlindsControlCharacteristic(characteristic: noble.Characteristic) {
    this.blindsControlCharacteristic = characteristic
    this.blindsControlCharacteristic.on("data", (data: number[]) => {
      this.debugLog("--------Notification--------")
      const dataArray = new Uint8Array(data)
      this.debugLog(`Data received:` + dataArray)
      let percentage: number | null = null

      switch (data[1]) {
        case DeviceValues.AM43_COMMAND_ID_GET_POSITION:
          this.debugLog("Position update received")
          percentage = dataArray[5]
          this.debugLog(`Closed Percentage ${percentage}`)
          this.position = percentage

          this.positionHistory.unshift(percentage)
          this.positionHistory.length = Math.min(
            DeviceValues.POSITION_HISTORY_LENGTH,
            this.positionHistory.length
          )

          this.emit("position", this.position)
          break

        case DeviceValues.AM43_COMMAND_ID_GET_LIGHTSENSOR:
          this.debugLog("light sensor update received")
          percentage = dataArray[4]
          this.debugLog(`Light level ${percentage}`)
          this.emit("lightLevel", percentage)
          break

        case DeviceValues.AM43_COMMAND_ID_GET_BATTERYSTATUS:
          this.debugLog("Battery Status update received")
          percentage = dataArray[7]
          this.debugLog(`Battery Percentage ${percentage}`)
          this.batteryPercentage = percentage
          this.emit("batteryPercentage", this.batteryPercentage)
          break

        case DeviceValues.AM43_NOTIFY_POSITION:
          this.debugLog("Position notify received")
          percentage = dataArray[4]
          this.debugLog(`Closed Percentage ${percentage}`)
          this.position = percentage

          this.positionHistory.unshift(percentage)
          this.positionHistory.length = Math.min(
            DeviceValues.POSITION_HISTORY_LENGTH,
            this.positionHistory.length
          )

          this.emit("position", this.position)
          break

        case DeviceValues.AM43_COMMAND_ID_SET_MOVE:
          this.debugLog("Set move notify received")
          if (dataArray[3] == DeviceValues.AM43_RESPONSE_ACK) {
            this.debugLog("Set move acknowledged")
          } else if (dataArray[3] == DeviceValues.AM43_RESPONSE_NACK) {
            this.debugLog("Set move denied")
          }
          break

        case DeviceValues.AM43_COMMAND_ID_SET_POSITION:
          this.debugLog("Set position notify received")
          if (dataArray[3] == DeviceValues.AM43_RESPONSE_ACK) {
            this.debugLog("Set position acknowledged")
          } else if (dataArray[3] == DeviceValues.AM43_RESPONSE_NACK) {
            this.debugLog("Set position denied")
          }
          break

        default:
          break
      }

      if (this.targetPosition != null && this.position != null) {
        let direction: 0 | 1 | 2 =
          this.targetPosition < this.position ? DIRECTION.OPEN : DIRECTION.CLOSE
        let targetPosition: null | number = this.targetPosition
        if (this.position == this.targetPosition || this.checkIfStopped()) {
          this.debugLog(
            `Target position ${this.targetPosition} reached @ ${this.position}`
          )
          targetPosition = null
        }
        if (targetPosition == null) direction = DIRECTION.STOP

        if (direction != this.direction) {
          this.direction = direction
          this.emit("direction", this.direction)
        }
        if (targetPosition != this.targetPosition) {
          this.targetPosition = targetPosition
          this.emit("targetPosition", this.targetPosition)
        }
      }
    })

    this.blindsControlCharacteristic.subscribe((error) => {
      if (error) {
        this.debugLog("Failed to subsribe to notifications")
      } else {
        this.debugLog("Subscribed to notifications")
      }
    })

    this.connectingPromise = null
    this.discoveringPromise = null
  }

  async prepareAsync() {
    if (!this.isConnected) await this.connectAsync()
    await this.updatePositionAsync()
  }

  async connectAsync() {
    if (!this.isConnected) {
      if (this.connectingPromise == null)
        this.connectingPromise = this.peripheral.connectAsync()

      await this.connectingPromise
      this.connectingPromise = null
    }
    if (this.discoveringPromise == null)
      this.discoveringPromise =
        this.peripheral.discoverSomeServicesAndCharacteristicsAsync(
          [DeviceValues.AM43_SERVICE_ID],
          [DeviceValues.AM43_CHARACTERISTIC_ID]
        )
    const { characteristics } = await this.discoveringPromise
    this.discoveringPromise = null
    this.setBlindsControlCharacteristic(characteristics[0])

    if (this.config.pass_code)
      await this.authWithPassCode(this.config.pass_code)
  }

  async authWithPassCode(passcode: string) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    const data16Bit = new Uint16Array([parseInt(passcode)])
    const data = new Uint8Array(data16Bit.buffer).reverse()
    await this.sendCommandAsync(DeviceValues.AM43_COMMAND_PASSCODE, data)
  }

  async disconnectAsync() {
    this.isConnected = false
    this.connectingPromise = null
    this.discoveringPromise = null
    this.blindsControlCharacteristic = null
    await this.peripheral.disconnectAsync()
  }

  async enableNotificationsAsync() {
    try {
      await this.blindsControlCharacteristic?.subscribeAsync()
      this.debugLog("Subscribed to notifications")
    } catch (e) {
      this.debugLog("Failed to subsribe to notifications")
    }
  }

  private startDisconnectTimeout(): void {
    if (this.interactionTimeout > 0) {
      if (this.disconnectTimeout) clearTimeout(this.disconnectTimeout)
      this.disconnectTimeout = setTimeout(
        () => this.disconnectAsync(),
        this.interactionTimeout * 1000
      )
    }
  }

  async setPositionAsync(position: number, trackPosition: boolean) {
    this.startDisconnectTimeout()
    this.targetPosition = position
    await this.sendCommandAsync(DeviceValues.AM43_COMMAND_ID_SET_POSITION, [
      position,
    ])
    if (trackPosition == true) this.trackCurrentPosition()
  }

  trackCurrentPosition() {
    setTimeout(async () => {
      await this.updatePositionAsync()
      if (this.targetPosition != null) this.trackCurrentPosition()
    }, 1000)
  }

  checkIfStopped() {
    if (this.positionHistory.length < DeviceValues.POSITION_HISTORY_LENGTH)
      return false
    return this.positionHistory.every((v) => v === this.positionHistory[0])
  }

  async openAsync() {
    this.startDisconnectTimeout()
    this.targetPosition = 0
    this.direction = DIRECTION.OPEN
    await this.sendCommandAsync(DeviceValues.AM43_COMMAND_ID_SET_MOVE, [
      DeviceValues.AM43_MOVE_OPEN,
    ])
    this.emit("direction", this.direction)
    this.emit("targetPosition", this.targetPosition)
  }

  async closeAsync() {
    this.startDisconnectTimeout()
    this.targetPosition = 100
    this.direction = DIRECTION.CLOSE
    await this.sendCommandAsync(DeviceValues.AM43_COMMAND_ID_SET_MOVE, [
      DeviceValues.AM43_MOVE_CLOSE,
    ])
    this.emit("direction", this.direction)
    this.emit("targetPosition", this.targetPosition)
  }

  async stopAsync() {
    this.startDisconnectTimeout()
    this.targetPosition = null
    this.direction = DIRECTION.STOP
    await this.sendCommandAsync(DeviceValues.AM43_COMMAND_ID_SET_MOVE, [
      DeviceValues.AM43_MOVE_STOP,
    ])
    this.emit("direction", this.direction)
    this.emit("targetPosition", this.targetPosition)
  }

  async updatePositionAsync() {
    await this.sendCommandAsync(DeviceValues.AM43_COMMAND_ID_GET_POSITION, [
      0x1,
    ])
  }

  async updateBatteryStatusAsync() {
    await this.sendCommandAsync(
      DeviceValues.AM43_COMMAND_ID_GET_BATTERYSTATUS,
      [0x1]
    )
  }

  async updateLightSensorAsync() {
    await this.sendCommandAsync(DeviceValues.AM43_COMMAND_ID_GET_LIGHTSENSOR, [
      0x1,
    ])
  }

  async sendCommandAsync(commandID: number, data: number[] | Uint8Array) {
    if (!this.isConnected) await this.connectAsync()
    this.debugLog("--------Command--------")
    this.debugLog(`Sending command to device: ${this.id}`)
    const buffer = buildCommandBuffer(commandID, data)
    let hexString = buffer.toString("hex")
    this.debugLog(`Sending command: ${hexString}`)
    this.debugLog(
      `Blinds characteristic available: ${
        this.blindsControlCharacteristic !== null &&
        this.blindsControlCharacteristic !== undefined
      }`
    )
    try {
      await this.blindsControlCharacteristic?.writeAsync(buffer, true)
    } catch (error) {
      this.debugLog(`Failed write command with error: ${error}`)
    }
  }
}

export { AM43Device }
*/
