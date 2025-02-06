const { app, globalShortcut, shell, ipcMain, BrowserWindow, Tray, Menu, nativeImage, screen, session} = require('electron')
const path = require('node:path')
const { ElectronBlocker } = require('@cliqz/adblocker-electron');
const fetch = require('cross-fetch'); // required 'fetch'
const { log } = require('node:console');

let mainWindow;
function createWindow () {

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    // frame: false,
    icon: __dirname + '/app/lib/assets/sc-icon.jpg',
    webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
			webviewTag: true,
		}
  })

  mainWindow.setMenuBarVisibility(false)
  mainWindow.loadFile('app/index.html')
  
  // Open the DevTools.
  // mainWindow.webContents.openDevTools()
}


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow()

  apppath = app.getAppPath()
  console.log(apppath);

  // ON MAIN WINDOW LOAD
  mainWindow.webContents.on('dom-ready', () => {

    mainWindow.webContents.send("apppath", apppath)

    // adblocker
    ElectronBlocker.fromPrebuiltAdsAndTracking(fetch).then((blocker) => {
      blocker.enableBlockingInSession(session.defaultSession);
    });

  });
  
  

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

app.on('browser-window-focus', function () {
	console.log("window focused")
  globalShortcut.register("MediaPlayPause", () => {
		mainWindow.webContents.send("appReqMediaPlayPause")
		console.log("MediaPlayPause is pressed");
	});
	globalShortcut.register("MediaNextTrack", () => {
		mainWindow.webContents.send("appReqMediaNextTrack")
		console.log("MediaNextTrack is pressed");
	});
	globalShortcut.register("MediaPreviousTrack", () => {
		mainWindow.webContents.send("appReqMediaPreviousTrack")
		console.log("MediaPreviousTrack is pressed");
	});
});


// TODO: Fix icon states in renderer when switching
ipcMain.on("appReqMaximizeApp",() => {
  if (mainWindow.isFullScreen()) {
		mainWindow.setFullScreen(false)
	} else {
		mainWindow.setFullScreen(true)
	}
})
ipcMain.on("appReqFullscreenApp",() => {
	mainWindow.setFullScreen(true)
})
ipcMain.on("appReqMinimizeApp",() => {
  mainWindow.minimize();
});
ipcMain.on("appReqCloseApp",() => {
  app.quit();
});