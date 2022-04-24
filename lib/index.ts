import { AM43Platform } from "./AM43Platform"
import { API } from "homebridge"
import { PLATFORM_NAME, PLUGIN_NAME } from "./settings"

export default function (api: API) {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, AM43Platform)
}
