const { app, globalShortcut, shell, ipcMain, BrowserWindow, Tray, Menu, nativeImage, screen, session} = require('electron')
const path = require('node:path')
const { ElectronBlocker } = require('@cliqz/adblocker-electron');
const fetch = require('cross-fetch'); // required 'fetch'


let mainWindow;
let tray;
function createWindow () {

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    // frame: false,
    icon: 'app/lib/assets/icon.ico',
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
  
  console.log(__dirname + '/app/lib/assets/icon.ico')
  var trayicon = nativeImage.createFromPath(__dirname + '/app/lib/assets/icon.ico')
  tray = new Tray(trayicon)
  tray.setTitle('BetterSoundCloud')

  tray.on('click', event => {
    console.log('tray left clicked')
    event.preventDefault
    mainWindow.show()
  })

  var trayCtxMenu = Menu.buildFromTemplate([
    { label: 'Play/Pause', type: 'normal', click: () => mainWindow.webContents.send("appReqMediaPlayPause") },
    { label: 'Skip', type: 'normal', click: () => mainWindow.webContents.send("appReqMediaNextTrack") },
    { label: 'Exit', type: 'normal', click: () => app.quit() },
  ])
  tray.setContextMenu(trayCtxMenu)

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
  globalShortcut.register("CommandOrControl+R", () => {
		mainWindow.webContents.send("appReqCtrlR")
		console.log("CtrlR is pressed");
	});
  globalShortcut.register("F5", () => {
		mainWindow.webContents.send("appReqF5")
		console.log("F5 is pressed");
	});
  globalShortcut.register("Esc", () => {
		mainWindow.webContents.send("appReqEsc")
		console.log("Esc is pressed");
	});
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

app.on('browser-window-blur', function () {
	console.log("window blurred")
	globalShortcut.unregister('CommandOrControl+R');
	globalShortcut.unregister('F5');
	globalShortcut.unregister('Esc');
});


// TODO: Fix icon states in renderer when switching
ipcMain.on("appReqMaximizeApp",() => {
  if (mainWindow.isFullScreen()) {
		mainWindow.setFullScreen(false)
    mainWindow.webContents.send("fixviewicons", "1icon")
	} else {
		mainWindow.setFullScreen(true)
    mainWindow.webContents.send("fixviewicons", "3icon")
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
ipcMain.on("appReqReloadApp",() => {
  app.relaunch();
  app.quit();
});