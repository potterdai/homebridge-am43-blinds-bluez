import { HomebridgePluginUiServer } from "@homebridge/plugin-ui-utils"
import { DeviceValues } from "../lib/utils/values"
import { buildCommandBuffer } from "../lib/utils/commands"
// import noble from "@abandonware/noble"
import { DeviceObject } from "./types"
import { ble } from "../lib/utils/ble"
import { resolve } from "path"
import NodeBle from "node-ble"

class AM43UiServer extends HomebridgePluginUiServer {
  // private _connectedDevice: null | noble.Peripheral
  // private _discoveredDevices: noble.Peripheral[]
  // private _controlCharacteristics: {
  //   [key: noble.Peripheral["id"]]: noble.Characteristic
  // }

  private currentNotificationCallback: ((data: Buffer) => void) | null

  constructor() {
    super()

    this.currentNotificationCallback = null

    this.onRequest("/scan_for_devices", (...args) =>
      this.handleScanRequest(...args)
    )
    this.onRequest("/connect_to_device", (...args) =>
      this.handleConnectRequest(...args)
    )

    this.onRequest("/disconnect_from_device", (...args) =>
      this.handleDisconnectRequest(...args)
    )

    this.onRequest("/rename_device", (...args) =>
      this.handleNameChangeRequest(...args)
    )

    this.onRequest("/auth_with_passcode", (...args) =>
      this.handleAuthWithPasscode(...args)
    )

    this.onRequest("/move_motor", (...args) => this.handleMotorMove(...args))

    this.onRequest("/adjust_limit", (...args) =>
      this.handleAdjustLimit(...args)
    )

    // this._discoveredDevices = []
    // this._connectedDevice = null

    // this._controlCharacteristics = {}

    this.ready()
  }

  // deviceToObject(device): DeviceObject {
  //   let { address, advertisement } = device
  //   const { localName, rssi } = advertisement
  //   const id = this._discoveredDevices.indexOf(device)
  //   const isOnMac = process.platform === "darwin"
  //   if (isOnMac) address = address || device.id
  //   return { address, rssi, localName, id, isOnMac }
  // }

  async handleScanRequest({ scan_time }): Promise<DeviceObject[]> {
    const rawDeviceUUIDs = await ble.discover()
    const devices: DeviceObject[] = []

    for (let index = 0; index < rawDeviceUUIDs.length; index++) {
      try {
        const { device } = await this.connectWithTimeout(rawDeviceUUIDs[index])
        devices.push({
          name: await device.getName(),
          address: await device.getAddress(),
        })

        await device.disconnect()
      } catch (err) {
        this.pushEvent("connection-failed", { uuid: rawDeviceUUIDs[index] })
      }
    }
    return devices
  }

  private async connectWithTimeout(
    uuid: string,
    wait = 5
  ): Promise<ReturnType<typeof ble["connectToDevice"]>> {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(reject, wait * 1000)
      ble
        .connectToDevice(uuid)
        .then((r) => {
          clearTimeout(timeout)
          resolve(r)
        })
        .catch(() => {
          console.log("failed to connect")
          reject()
        })
    })
  }

  async handleConnectRequest({ device_id }): Promise<DeviceObject> {
    const { device } = await this.connectWithTimeout(device_id)
    await this.subscribeToEvents({ device_id })
    return { name: await device.getName(), address: await device.getAddress() }
  }

  async handleDisconnectRequest({ device_id }): Promise<void> {
    if (this.currentNotificationCallback) {
      await ble.unsubscribe(this.currentNotificationCallback)
      this.currentNotificationCallback = null
    }
  }

  async subscribeToEvents({ device_id }: { device_id: string }): Promise<void> {
    const { serviceUUID, characteristicUUID } =
      await ble.getServiceAndCharacteristicUUIDs(device_id)

    if (this.currentNotificationCallback) {
      await ble.unsubscribe(this.currentNotificationCallback)
      this.currentNotificationCallback = null
    }

    this.currentNotificationCallback = (data) =>
      this.sendNotification({ device_id, data })

    await ble.subscribe(
      device_id,
      serviceUUID,
      characteristicUUID,
      this.currentNotificationCallback
    )
  }

  sendNotification({ device_id, data }: { device_id: string; data: Buffer }) {
    const notificationToEvent: { [key: string]: string } = {
      "9a35015a31": "name-change-success",
      "9a1701a5ce": "auth-error",
      "9a17015a31": "auth-success",
      "9a22015a31": "limit-set-success",
      "9a22015b31": "limit-save-success",
      "9a22015c31": "limit-cancel-success",
    }

    const eventName = notificationToEvent[data.toString("hex")]
    if (eventName) this.pushEvent(eventName, { device_id })
  }

  async handleNameChangeRequest({
    device_id,
    new_name,
  }): Promise<DeviceObject> {
    const { serviceUUID, characteristicUUID } =
      await ble.getServiceAndCharacteristicUUIDs(device_id)
    const data = new_name
      .split("")
      .map((letter) => letter.charCodeAt(0))
      .map((value) => (value > 254 ? "?".charCodeAt(0) : value))

    await ble.writeValue(
      device_id,
      serviceUUID,
      characteristicUUID,
      buildCommandBuffer(DeviceValues.AM43_COMMAND_CHANGE_NAME, data)
    )
    return this.handleConnectRequest({ device_id })
  }

  async handleAuthWithPasscode({
    device_id,
    passcode,
  }: {
    device_id: string
    passcode: string
  }) {
    const { serviceUUID, characteristicUUID } =
      await ble.getServiceAndCharacteristicUUIDs(device_id)

    const data16Bit = new Uint16Array([parseInt(passcode)])
    const data = new Uint8Array(data16Bit.buffer).reverse()

    await ble.writeValue(
      device_id,
      serviceUUID,
      characteristicUUID,
      buildCommandBuffer(DeviceValues.AM43_COMMAND_PASSCODE, data)
    )

    return "OK"
  }

  async handleAdjustLimit({ device_id, openOrClose, phase }) {
    const { serviceUUID, characteristicUUID } =
      await ble.getServiceAndCharacteristicUUIDs(device_id)

    const COMMANDS = {
      OPENED: {
        SET: Uint8Array.from([0x00, 0x01, 0x00]),
        SAVE: Uint8Array.from([0x20, 0x01, 0x00]),
        CANCEL: Uint8Array.from([0x40, 0x01, 0x00]),
      },
      CLOSED: {
        SET: Uint8Array.from([0x00, 0x02, 0x00]),
        SAVE: Uint8Array.from([0x20, 0x02, 0x00]),
        CANCEL: Uint8Array.from([0x40, 0x01, 0x00]),
      },
    }

    await ble.writeValue(
      device_id,
      serviceUUID,
      characteristicUUID,
      buildCommandBuffer(
        DeviceValues.AM43_COMMAND_SET_LIMIT,
        COMMANDS[openOrClose][phase]
      )
    )
  }

  async handleMotorMove({ device_id, command }) {
    const { serviceUUID, characteristicUUID } =
      await ble.getServiceAndCharacteristicUUIDs(device_id)

    const COMMAND_TO_DATA = {
      OPEN: DeviceValues.AM43_MOVE_OPEN,
      CLOSE: DeviceValues.AM43_MOVE_CLOSE,
      STOP: DeviceValues.AM43_MOVE_STOP,
    }

    console.log(
      buildCommandBuffer(
        DeviceValues.AM43_COMMAND_ID_SET_MOVE,
        COMMAND_TO_DATA[command]
      )
    )

    await ble.writeValue(
      device_id,
      serviceUUID,
      characteristicUUID,
      buildCommandBuffer(DeviceValues.AM43_COMMAND_ID_SET_MOVE, [
        COMMAND_TO_DATA[command],
      ])
    )
  }

  /*

  async connectToDevice(device_id): Promise<noble.Peripheral> {
    const device = this._discoveredDevices[device_id]
    if (this._connectedDevice === device) return device

    return new Promise((resolve, reject) => {
      if (!device) {
        reject(new Error(`Device ${device_id} not found`))
        return
      }
      device.connect((err) => {
        if (err) reject(err)
      })
      device.once("connect", () => {
        this._connectedDevice = device
        this.pushEvent("device-connected", this.deviceToObject(device))

        device.once("disconnect", () => {
          this._connectedDevice = null
          this._controlCharacteristics[device_id] = null
        })

        resolve(device)
      })
    })
  }

  async handleConnectRequest({ device_id }): Promise<DeviceObject> {
    return this.connectToDevice(device_id).then((device) =>
      this.deviceToObject(device)
    )
  }

  async getControlCharacteristic(device_id): Promise<noble.Characteristic> {
    if (this._controlCharacteristics[device_id]) {
      return this._controlCharacteristics[device_id]
    }
    const device = await this.connectToDevice(device_id)
    return new Promise((resolve, reject) => {
      device.discoverSomeServicesAndCharacteristics(
        [DeviceValues.AM43_SERVICE_ID],
        [DeviceValues.AM43_CHARACTERISTIC_ID],
        (error, _, characteristics) => {
          if (error) {
            reject(error)
            return
          }
          this._controlCharacteristics[device_id] = characteristics[0]

          const notificationToEvent: { [key: string]: string } = {
            "9a35015a31": "name-change-success",
            "9a1701a5ce": "auth-error",
            "9a17015a31": "auth-success",
            "9a22015a31": "limit-set-success",
            "9a22015b31": "limit-save-success",
            "9a22015c31": "limit-cancel-success",
          }

          const sendAsPushEvent = (data) => {
            const eventName = notificationToEvent[data.toString("hex")]
            if (eventName) this.pushEvent(eventName, {})
          }

          this._controlCharacteristics[device_id].on("data", sendAsPushEvent)
          this._connectedDevice.once("disconnect", () => {
            if (this._controlCharacteristics[device_id])
              this._controlCharacteristics[device_id].off(
                "data",
                sendAsPushEvent
              )
          })
          resolve(this._controlCharacteristics[device_id])
        }
      )
    })
  }

  async handleAuthWithPasscode({
    device_id,
    passcode,
  }: {
    device_id: string
    passcode: string
  }) {
    const controlCharacteristic = await this.getControlCharacteristic(device_id)
    await new Promise((resolve) => setTimeout(resolve, 500))

    const data16Bit = new Uint16Array([parseInt(passcode)])
    const data = new Uint8Array(data16Bit.buffer).reverse()

    const commandBuffer = buildCommandBuffer(
      DeviceValues.AM43_COMMAND_PASSCODE,
      data
    )
    await controlCharacteristic.writeAsync(commandBuffer, true)

    return "OK"
  }

  async handleChangeNameRequest({ device_id, new_name }) {
    const controlCharacteristic = await this.getControlCharacteristic(device_id)
    const data = new_name
      .split("")
      .map((letter) => letter.charCodeAt(0))
      .map((value) => (value > 254 ? "?".charCodeAt(0) : value))
    await new Promise((resolve) => setTimeout(resolve, 500))
    await controlCharacteristic.writeAsync(
      buildCommandBuffer(DeviceValues.AM43_COMMAND_CHANGE_NAME, data),
      true
    )
    return this.deviceToObject(this._connectedDevice)
  }

  async handleAdjustLimit({ device_id, openOrClose, phase }) {
    const controlCharacteristic = await this.getControlCharacteristic(device_id)
    const COMMANDS = {
      OPENED: {
        SET: Uint8Array.from([0x00, 0x01, 0x00]),
        SAVE: Uint8Array.from([0x20, 0x01, 0x00]),
        CANCEL: Uint8Array.from([0x40, 0x01, 0x00]),
      },
      CLOSED: {
        SET: Uint8Array.from([0x00, 0x02, 0x00]),
        SAVE: Uint8Array.from([0x20, 0x02, 0x00]),
        CANCEL: Uint8Array.from([0x40, 0x01, 0x00]),
      },
    }

    await controlCharacteristic.writeAsync(
      buildCommandBuffer(
        DeviceValues.AM43_COMMAND_SET_LIMIT,
        COMMANDS[openOrClose][phase]
      ),
      true
    )
  }

  async handleMotorMove({ device_id, command }) {
    const controlCharacteristic = await this.getControlCharacteristic(device_id)

    const COMMAND_TO_DATA = {
      OPEN: DeviceValues.AM43_MOVE_OPEN,
      CLOSE: DeviceValues.AM43_MOVE_CLOSE,
      STOP: DeviceValues.AM43_MOVE_STOP,
    }

    await controlCharacteristic.writeAsync(
      buildCommandBuffer(DeviceValues.AM43_COMMAND_ID_SET_MOVE, [
        COMMAND_TO_DATA[command],
      ]),
      true
    )
  }

  */
}

;(() => {
  return new AM43UiServer()
})()
