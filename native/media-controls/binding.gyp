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
          "#": "C++20, never 17: C++/WinRT under C++17 falls back to <experimental/coroutine>, which Visual Studio 2026's library refuses outright (STL1011; the v0.9.0 release build failed on it, 2026-11-15). node-gyp asks for C++20 anyway; this says so here, so nothing overrides it again.",
          "AdditionalOptions": ["/std:c++20", "/permissive-", "/bigobj"]
        }
      }
    }
  ]
}
