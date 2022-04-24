import { PlatformConfig } from "homebridge"

export type PerDeviceConfig = {
  name?: string
  address: string
  pass_code?: string
} & (
  | {
      has_tilt: true
      tilt_motor: {
        address: string
        pass_code?: string
        orientation: "vertical" | "horizontal"
      }
    }
  | { has_tilt: false }
)

export interface AM43Config extends PlatformConfig {
  poll_interval: number
  hap_interaction_timeout: number
  allowed_devices: PerDeviceConfig[]
}
