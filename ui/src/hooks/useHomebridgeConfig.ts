import { PluginConfig } from "@homebridge/plugin-ui-utils/dist/ui.interface"
import { useEffect, useState } from "react"

const useHomebridgeConfig = <Config extends PluginConfig>(): {
  config: null | Config
  updateConfig: (newConfig: Config) => void
  saveConfig: () => Promise<void>
} => {
  const [config, setConfig] = useState<Config | null>(null)

  useEffect(() => {
    homebridge.getPluginConfig().then((currentConfig) => {
      setConfig(currentConfig[0] as Config)
    })
  }, [])

  const updateConfig = async (newConfig: Config) => {
    await homebridge.updatePluginConfig([newConfig])
    setConfig(newConfig)
  }

  const saveConfig = async () => await homebridge.savePluginConfig()

  return { config, updateConfig, saveConfig }
}

export { useHomebridgeConfig }
