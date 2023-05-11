const { app, globalShortcut, shell, ipcMain, BrowserWindow } = require('electron')
const path = require('path')
const process = require('process')


let mainWindow;

function createWindow () {
	// Create the browser window.
	mainWindow = new BrowserWindow({
	width: 1920,
	height: 1080,
	icon: "lib/assets/bw-icon.png",

	webPreferences: {
		nodeIntegration: true,
		contextIsolation: false,
		webviewTag: true,
	}
})

	mainWindow.setMenuBarVisibility(false)
	mainWindow.loadFile('lib/index.html')
}

function localPluginsAndThemes() {
	
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
	createWindow()

	app.on('activate', function () {
		// On macOS it's common to re-create a window in the app when the
		// dock icon is clicked and there are no other windows open.
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})
})

// Handle f5 and ctrl+r
app.on('browser-window-focus', function () {
	console.log("window focused")
	globalShortcut.register("CommandOrControl+R", () => {
		mainWindow.webContents.send("appReqCntrlR")
		console.log("CommandOrControl+R is pressed");
	});
	globalShortcut.register("F5", () => {
		mainWindow.webContents.send("appReqF5")
		console.log("F5 is pressed");
	});
    globalShortcut.register("Esc", () => {
		mainWindow.webContents.send("appReqEsc")
		console.log("Esc is pressed");
	});
});
app.on('browser-window-blur', function () {
	console.log("window blurred")
	globalShortcut.unregister('CommandOrControl+R');
	globalShortcut.unregister('F5');
	globalShortcut.unregister('Esc');
});

ipcMain.on ("appReqClose", (event, args) => {
	app.quit()
});
ipcMain.on ("appReqMaximize", (event, args) => {
	if (mainWindow.isFullScreen()) {
		mainWindow.setFullScreen(false)
	} else {
		mainWindow.setFullScreen(true)
	}
});
ipcMain.on ("appReqJustFullscreen", (event, args) => {
	mainWindow.setFullScreen(true)
	mainWindow.webContents.send("appReqJustFullscreenUIFIX")
});
ipcMain.on ("appReqMinimize", (event, args) => {
	mainWindow.minimize()
});
// Restart window (made for handling custom cntrl + r and f5)
ipcMain.on ("appReqRestartWindow", (event, args) => {
	mainWindow.reload()
})

// Show downloaded item on file explorer
ipcMain.on ("appDownloaderFinish", (event, args) => {
	shell.openPath('C:\\BetterSoundCloud\\Downloads')
})
// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
	if (process.platform !== 'darwin') app.quit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
