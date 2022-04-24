import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
  HAPStatus,
} from "homebridge"

import { DIRECTION } from "./utils/values"
import { PackageJSON } from "homebridge/lib/pluginManager"
//@ts-ignore
import packageJSON from "../package.json"
import { AM43Config, PerDeviceConfig } from "./types"
import { PLATFORM_NAME, PLUGIN_NAME } from "./settings"
import { updateCharacteristicValue } from "./utils/updateCharacteristicValue"
import { ble } from "./utils/ble"
import { AM43Device } from "./AM43Device"

interface AM43AccessoryContext {
  lastPositionUpdate: number | null
  hapInteractionTimeout: number
  am43: {
    id: string
    lastPosition: number
    lastBatteryPercentage: number
    address: string
  }
}

const StaticVariables = {
  DEFAULT_HAP_INTERACTION_TIMEOUT: 1.5 * 60, // The minimum amount of time since HAP has interacted with the device before it should disconnect. In seconds
  DEFAULT_POLL_INTERVAL: 5 * 60, // The time between polling requests for the position, battery and light sensor. In seconds
  DEFAULT_SCANNING_TIMEOUT: 8, // The time for which the plugin should scan for devices during launch. In seconds
  POSITION_UPDATE_INTERVAL: 2 * 60, // The minimum time between the request for position updates. In seconds
  MISSING_DEVICES_SCANNING_TIMEOUT: 5, // The time for which the plugin should scan for devices when it is missing a device. In seconds
  HAP_NO_INTERACTION_GRACE_PERIOD: 5, // The grace period that is applied when the HAP interaction timeout has been reached. This is to give HAP some time to interact with the device before disconnection. In seconds
  MINIMUM_POLL_INTERVAL: 5, // The minimum required poll interval. In seconds.
}

class AM43Platform implements DynamicPlatformPlugin {
  private configJSON: AM43Config
  private packageJSON: PackageJSON
  private accessories: PlatformAccessory<AM43AccessoryContext>[]
  private Service: typeof Service
  private Characteristic: typeof Characteristic
  private allowedDevices: AM43Config["allowed_devices"]
  private discoveredDevices: AM43Device[]

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API
  ) {
    this.configJSON = config as AM43Config
    this.log = log
    this.api = api
    this.packageJSON = packageJSON
    this.accessories = []
    this.log.info("Starting AM43 platform")
    this.Service = this.api.hap.Service
    this.Characteristic = this.api.hap.Characteristic
    this.discoveredDevices = []
    this.allowedDevices = []
    this.setupConfigValues()
    api.on("didFinishLaunching", () => this.didFinishLaunching())
    api.on("shutdown", () => this.shutdown())
  }

  configureAccessory(accessory: PlatformAccessory<AM43AccessoryContext>) {
    this.accessories.push(accessory)
  }

  private setupConfigValues() {
    let configuredAllowedDevicesList = this.configJSON.allowed_devices
    this.allowedDevices = configuredAllowedDevicesList

    if (
      this.configJSON.hap_interaction_timeout != undefined &&
      this.configJSON.hap_interaction_timeout <= 0
    ) {
      this.log.warn(
        "Automatic disconnection of AM43 devices is disabled and the connection will be kept open. This might cause higher power usage of the devices but improve responsiveness."
      )
    }

    if (
      this.configJSON.poll_interval != undefined &&
      this.configJSON.poll_interval < StaticVariables.MINIMUM_POLL_INTERVAL
    ) {
      this.log.warn(
        `Polling for devices is disabled due too a low poll interval. This might cause an incorrect state in HomeKit apps. Polling requires a value of ${StaticVariables.MINIMUM_POLL_INTERVAL} (seconds) or higher.`
      )
    }
  }

  private async didFinishLaunching() {
    this.log.info("AM43-PI discover...")
    // splits the HomeKit init phase from the BLE init phase because BLE
    // can fail in a way that can't be caught & cause the homekit devices to be lost

    for (let index = 0; index < this.allowedDevices.length; index++) {
      const blindConfig = this.allowedDevices[index]
      const device = await this.initDevice(blindConfig, false)

      if (blindConfig.has_tilt) {
        const tiltDevice = await this.initDevice(
          {
            ...blindConfig.tilt_motor,
            has_tilt: false,
          },
          true
        )
        device.addTiltMotor(tiltDevice)
      }
    }

    for (let index = 0; index < this.discoveredDevices.length; index++) {
      const device = this.discoveredDevices[index]
      await device.firstConnect()
      await device.updatePosition()
      if (device.tiltMotor) await device.updateTilt()
    }
  }

  private async initDevice(
    perBlindConfig: PerDeviceConfig,
    isTiltMotor: boolean
  ): Promise<AM43Device> {
    return new Promise((resolve, reject) => {
      const HomeKituuid = this.api.hap.uuid.generate(perBlindConfig.address)
      const existingAccessory = this.accessories.find(
        (accessory) => accessory.UUID == HomeKituuid
      )

      const device = new AM43Device({
        uuid: perBlindConfig.address,
        config: perBlindConfig,
        interactionTimeout: this.configJSON.hap_interaction_timeout,
        log: this.log,
      })
      this.discoveredDevices.push(device)

      if (isTiltMotor) {
        this.log.info(`Added Motor as Tilt: ${device.description}`)
        resolve(device)
        return
      }

      if (!existingAccessory) {
        this.log.info(`Found new AM43 Motor: ${device.description}`)
        let accessory = this.createAccessory(device, perBlindConfig.address)
        this.setupAccessory(accessory, device, perBlindConfig)
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ])
      } else {
        this.log.info(`Found known AM43 Motor: ${device.description}`)
        this.setupAccessory(existingAccessory, device, perBlindConfig)
        this.api.updatePlatformAccessories([existingAccessory])
      }
      resolve(device)
      //})
    })
  }

  private async shutdown() {
    this.log.info(
      "Homebridge is shutting down, disconnecting AM43 motors and saving state..."
    )

    for (let index = 0; index < this.discoveredDevices.length; index++) {
      const device = this.discoveredDevices[index]
      await device.disconnect()
    }

    ble.destroyBluetooth()
  }

  private createAccessory(device: AM43Device, address: string) {
    const uuid = this.api.hap.uuid.generate(address)
    return new this.api.platformAccessory<AM43AccessoryContext>(
      device.name,
      uuid
    )
  }

  private setupAccessory(
    accessory: PlatformAccessory<AM43AccessoryContext>,
    device: AM43Device,
    deviceConfig: PerDeviceConfig
  ) {
    this.configureWindowCoveringServiceOnAccessory(
      accessory,
      device,
      deviceConfig
    )
    this.configureInformationServiceOnAccessory(accessory, device)
    this.configureBatteryServiceOnAccessory(accessory, device)
    this.configurePropertiesOnAccessory(accessory)

    device.on("ble:position", () => {
      updateCharacteristicValue(
        accessory,
        this.Service.WindowCovering,
        this.Characteristic.PositionState,
        device.getDirection() || null
      )

      updateCharacteristicValue(
        accessory,
        this.Service.WindowCovering,
        this.Characteristic.CurrentPosition,
        100 - device.position
      )

      if (device.getDirection() === DIRECTION.STOP)
        updateCharacteristicValue(
          accessory,
          this.Service.WindowCovering,
          this.Characteristic.TargetPosition,
          100 - device.position
        )
    })

    if (deviceConfig.has_tilt) {
      device.on("tilt", (tilt: number) =>
        updateCharacteristicValue(
          accessory,
          this.Service.WindowCovering,
          deviceConfig.tilt_motor.orientation === "vertical"
            ? this.Characteristic.CurrentVerticalTiltAngle
            : this.Characteristic.CurrentHorizontalTiltAngle,
          tilt
        )
      )
    }

    device.on("ble:battery", (percentage) => {
      this.log.debug("Notifying of new battery percentage: " + percentage)
      updateCharacteristicValue(
        accessory,
        this.Service.WindowCovering,
        this.Characteristic.BatteryLevel,
        percentage
      )
      updateCharacteristicValue(
        accessory,
        this.Service.WindowCovering,
        this.Characteristic.StatusLowBattery,
        percentage <= 10
      )
    })
  }

  private configurePropertiesOnAccessory(
    accessory: PlatformAccessory<AM43AccessoryContext>
  ) {
    accessory.context.lastPositionUpdate = null
    accessory.context.hapInteractionTimeout =
      this.configJSON.hap_interaction_timeout ??
      StaticVariables.DEFAULT_HAP_INTERACTION_TIMEOUT
  }

  private configureInformationServiceOnAccessory(
    accessory: PlatformAccessory<AM43AccessoryContext>,
    device: AM43Device
  ): void {
    const service =
      accessory.getService(this.Service.AccessoryInformation) ||
      accessory.addService(this.Service.AccessoryInformation)

    service
      .getCharacteristic(this.Characteristic.Manufacturer)
      .updateValue(PLATFORM_NAME)

    service
      .getCharacteristic(this.Characteristic.Model)
      .updateValue(PLUGIN_NAME)

    service.getCharacteristic(this.Characteristic.Name).updateValue(device.name)

    service
      .getCharacteristic(this.Characteristic.SerialNumber)
      .on("get", (callback) => callback(null, device.id))

    service
      .getCharacteristic(this.Characteristic.FirmwareRevision)
      .on("get", (callback) =>
        callback(null, this.packageJSON?.version || "1.1.1")
      )
  }

  private configureBatteryServiceOnAccessory(
    accessory: PlatformAccessory<AM43AccessoryContext>,
    device: AM43Device
  ): void {
    const service =
      accessory.getService(this.Service.Battery) ||
      accessory.addService(this.Service.Battery)

    service
      .getCharacteristic(this.Characteristic.BatteryLevel)
      .on("get", async (callback) => {
        const percentage = await device.updateBatteryStatus()
        return callback(
          percentage === false
            ? HAPStatus.SERVICE_COMMUNICATION_FAILURE
            : undefined,
          percentage
        )
      })

    service.getCharacteristic(this.Characteristic.ChargingState).updateValue(0)

    service
      .getCharacteristic(this.Characteristic.StatusLowBattery)
      .on("get", (callback) => callback(null, device.batteryPercentage <= 10))
  }

  private configureWindowCoveringServiceOnAccessory(
    accessory: PlatformAccessory<AM43AccessoryContext>,
    device: AM43Device,
    deviceConfig: PerDeviceConfig
  ): void {
    const service =
      accessory.getService(this.Service.WindowCovering) ||
      accessory.addService(this.Service.WindowCovering)

    service
      .getCharacteristic(this.Characteristic.CurrentPosition)
      .on("get", async (callback) => {
        const position = await device.updatePosition()
        if (position === false)
          return callback(HAPStatus.SERVICE_COMMUNICATION_FAILURE)
        return callback(null, 100 - position)
      })

    service
      .getCharacteristic(this.Characteristic.TargetPosition)
      .on("get", (callback) => {
        let targetPosition = device.targetPosition ?? device.position
        targetPosition = 100 - targetPosition
        this.log.debug("Reporting target position: " + targetPosition)
        return callback(null, targetPosition)
      })
      .on("set", async (value, callback) => {
        const targetPosition = 100 - parseInt(value.toString())
        const success = await device.setPosition(targetPosition)
        callback(success ? undefined : HAPStatus.SERVICE_COMMUNICATION_FAILURE)
      })

    service
      .getCharacteristic(this.Characteristic.PositionState)
      .on("get", (callback) => {
        this.log.debug(`Getting direction... ${device.getDirection()}`)
        callback(null, device.getDirection())
      })

    if (!deviceConfig.has_tilt) return

    service
      .getCharacteristic(
        deviceConfig.tilt_motor.orientation === "vertical"
          ? this.Characteristic.TargetVerticalTiltAngle
          : this.Characteristic.TargetHorizontalTiltAngle
      )
      .on("get", (callback) => {
        const tilt = device.targetTilt ?? device.tilt ?? 0
        this.log.debug("Reporting target tilt position: " + tilt)
        return callback(null, tilt)
      })
      .on("set", async (value, callback) => {
        const success = await device.setTilt(value.valueOf() as number)
        callback(success ? undefined : HAPStatus.SERVICE_COMMUNICATION_FAILURE)
      })

    service
      .getCharacteristic(
        deviceConfig.tilt_motor.orientation === "vertical"
          ? this.Characteristic.CurrentVerticalTiltAngle
          : this.Characteristic.CurrentHorizontalTiltAngle
      )
      .on("get", async (callback) => {
        const tilt = await device.updateTilt()
        if (tilt === false)
          return callback(HAPStatus.SERVICE_COMMUNICATION_FAILURE)
        return callback(null, tilt)
      })
  }
}

export { AM43Platform }
