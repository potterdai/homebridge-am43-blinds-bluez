import {
  Characteristic,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from "homebridge"

export const updateCharacteristicValue = (
  accessory: PlatformAccessory,
  service: Parameters<PlatformAccessory["getService"]>[0],
  characteristic: Parameters<Service["getCharacteristic"]>[0],
  value: Parameters<Characteristic["updateValue"]>[0]
) => {
  accessory
    ?.getService(service)
    ?.getCharacteristic(characteristic)
    ?.updateValue(value)
}
