import {
  Adapter,
  Bluetooth,
  createBluetooth,
  Device,
  GattCharacteristic,
  GattServer,
} from "node-ble"
import { DeviceValues } from "./values"

class BLE {
  private bluetooth: Bluetooth
  private destroy: () => void
  private adapter: Promise<Adapter>
  private uuidToDeviceAndGatt: Partial<
    Record<string, { device: Device; gattServer: GattServer }>
  >
  private callbackToCharacteristic: WeakMap<
    (buffer: Buffer) => void,
    GattCharacteristic
  >

  constructor() {
    const { bluetooth, destroy } = createBluetooth()
    this.bluetooth = bluetooth
    this.destroy = destroy
    this.adapter = this.bluetooth.defaultAdapter()
    this.uuidToDeviceAndGatt = {}
    this.callbackToCharacteristic = new WeakMap()
  }

  async discover(wait = 8): Promise<string[]> {
    const adapter = await this.adapter
    // 0000fe50-0000-1000-8000-00805f9b34fb
    if (!(await adapter.isDiscovering())) await adapter.startDiscovery(["fe50"])
    await new Promise((res, rej) => setTimeout(res, wait * 1000))
    if (await adapter.isDiscovering()) await adapter.stopDiscovery()
    const devices = (await adapter.devices()) || []
    return devices
  }

  async connectToDevice(
    uuid: string
  ): Promise<{ device: Device; gattServer: GattServer }> {
    const adapter = await this.adapter
    const deviceAndGatt = this.uuidToDeviceAndGatt[uuid]
    if (deviceAndGatt && (await deviceAndGatt.device.isConnected()))
      return deviceAndGatt

    const device = await adapter.waitDevice(uuid.toUpperCase())
    if (!device) throw Error(`Failed to connect to device ${uuid}`)
    await device.connect()
    const gattServer = await device.gatt()
    this.uuidToDeviceAndGatt[uuid] = { device, gattServer }
    return { device, gattServer }
  }

  async getServiceAndCharacteristicUUIDs(
    uuid: string
  ): Promise<{ serviceUUID: string; characteristicUUID: string }> {
    const { gattServer } = await this.connectToDevice(uuid)

    const services = await gattServer.services()
    const longServiceUUID = services.find((s) =>
      s.startsWith(`0000${DeviceValues.AM43_SERVICE_ID}`)
    )

    if (!longServiceUUID)
      throw new Error(`Failed to get service UUID from ${uuid}`)

    const service = await gattServer.getPrimaryService(longServiceUUID)

    const characteristics = await service.characteristics()
    const longCharacteristicUUID = characteristics.find((s) =>
      s.startsWith(`0000${DeviceValues.AM43_CHARACTERISTIC_ID}`)
    )

    if (!longCharacteristicUUID)
      throw new Error(`Failed to find control characteristic on ${uuid}`)
    return {
      serviceUUID: longServiceUUID,
      characteristicUUID: longCharacteristicUUID,
    }
  }

  async disconnectDevice(uuid: string) {
    const { device } = await this.connectToDevice(uuid)
    await device.disconnect()
  }

  async writeValue(
    uuid: string,
    primaryServiceUUID: string,
    characteristicUUID: string,
    value: Buffer
  ) {
    const { gattServer } = await this.connectToDevice(uuid)

    const service = await gattServer.getPrimaryService(primaryServiceUUID)
    const characteristic = await service.getCharacteristic(characteristicUUID)
    await characteristic.writeValue(value)
    const buffer = await characteristic.readValue()
  }

  async readValue(
    uuid: string,
    primaryServiceUUID: string,
    characteristicUUID: string
  ) {
    const { gattServer } = await this.connectToDevice(uuid)
    const service = await gattServer.getPrimaryService(primaryServiceUUID)
    const characteristic = await service.getCharacteristic(characteristicUUID)
    const buffer = await characteristic.readValue()
    return buffer
  }

  async subscribe(
    uuid: string,
    primaryServiceUUID: string,
    characteristicUUID: string,
    callback: (buffer: Buffer) => void
  ) {
    const { gattServer } = await this.connectToDevice(uuid)
    const service = await gattServer.getPrimaryService(primaryServiceUUID)
    const characteristic = await service.getCharacteristic(characteristicUUID)
    await characteristic.startNotifications()
    characteristic.on("valuechanged", callback)
    this.callbackToCharacteristic.set(callback, characteristic)
  }

  async unsubscribe(callback: (buffer: Buffer) => void) {
    if (this.callbackToCharacteristic.has(callback)) {
      const characteristic = this.callbackToCharacteristic.get(callback)
      characteristic?.stopNotifications()
    }
  }

  destroyBluetooth() {
    this.destroy()
  }
}

const ble = new BLE()
export { ble }
