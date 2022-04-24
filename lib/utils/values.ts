export const DeviceValues = {
  AM43_SERVICE_ID: "fe50",
  AM43_CHARACTERISTIC_ID: "fe51",

  AM43_COMMAND_PREFIX: Uint8Array.from([0x00, 0xff, 0x00, 0x00, 0x9a]),
  AM43_COMMAND_ID_SET_MOVE: 0x0a,

  AM43_COMMAND_PASSCODE: 0x17,

  AM43_MOVE_OPEN: 0xdd,
  AM43_MOVE_CLOSE: 0xee,
  AM43_MOVE_STOP: 0xcc,

  AM43_COMMAND_ID_SET_POSITION: 0x0d,
  AM43_COMMAND_ID_GET_POSITION: 0xa7,
  AM43_COMMAND_ID_GET_LIGHTSENSOR: 0xaa,
  AM43_COMMAND_ID_GET_BATTERYSTATUS: 0xa2,

  AM43_COMMAND_SET_LIMIT: 0x22,

  AM43_COMMAND_CHANGE_NAME: 0x35,

  AM43_RESPONSE_ACK: 0x5a,
  AM43_RESPONSE_NACK: 0xa5,

  AM43_NOTIFY_POSITION: 0xa1,

  POSITION_HISTORY_LENGTH: 5,
}

type Direction = "OPEN" | "CLOSE" | "STOP"

export const DIRECTION: { [k in Direction]: 0 | 1 | 2 } = {
  CLOSE: 0,
  OPEN: 1,
  STOP: 2,
}

export const PRIMARY_SERVICE_ID = "0000fe50-0000-1000-8000-00805f9b34fb"

export const NOTIFICATION_TO_EVENT: { [key: string]: string } = {
  "9a35015a31": "name-change-success",
  // "9a1701a5ce": "auth-error",
  // "9a17015a31": "auth-success",
  "9a22015a31": "limit-set-success",
  "9a22015b31": "limit-save-success",
  "9a22015c31": "limit-cancel-success",
}
