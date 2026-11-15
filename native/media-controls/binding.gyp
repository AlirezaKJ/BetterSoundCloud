{
  "targets": [
    {
      "target_name": "media_controls",
      "sources": ["media_controls.cc"],
      "defines": ["NAPI_VERSION=8", "UNICODE", "_UNICODE", "WIN32_LEAN_AND_MEAN", "NOMINMAX"],
      "libraries": ["windowsapp.lib", "ole32.lib"],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "WarningLevel": 4,
          "AdditionalOptions": ["/std:c++17", "/permissive-", "/bigobj"]
        }
      }
    }
  ]
}
