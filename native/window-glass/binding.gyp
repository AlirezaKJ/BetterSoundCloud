{
  "targets": [
    {
      "target_name": "window_glass",
      "sources": ["window_glass.cc"],
      "defines": ["NAPI_VERSION=8", "UNICODE", "_UNICODE"],
      "libraries": ["dwmapi.lib", "runtimeobject.lib", "CoreMessaging.lib", "user32.lib"],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "WarningLevel": 4,
          "AdditionalOptions": ["/std:c++17"]
        }
      }
    }
  ]
}
