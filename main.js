const { app, globalShortcut, shell, ipcMain, BrowserWindow, Tray, Menu, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
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

	// Prevent window from closing and quitting app
    // Instead make close simply hide main window
    // Clicking on tray icon will bring back main window
    mainWindow.on('close', event => {
        event.preventDefault()
        mainWindow.hide()
    })

    const icon = nativeImage.createFromPath('lib/assets/bw-icon.png')
    tray = new Tray(icon.resize({ width: 16, height: 16 }))
    tray.setIgnoreDoubleClickEvents(true)

    var trayMenu = Menu.buildFromTemplate([
        {
            label: 'Quit',
            click: _ => {
                console.log('Menu/Quit was clicked')
                app.exit()
            }
        }
    ]);
    tray.setContextMenu(trayMenu)

    // Prevent menu from being shown on left click
    // Instead make main window visible (if it had been invisible)
    tray.on('click', event => {
        console.log('tray left clicked')
        event.preventDefault
        mainWindow.show()
    })
})

// Handle Deep Links
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('bsc', process.execPath, [path.resolve(process.argv[1])])
    }
} else {
    app.setAsDefaultProtocolClient('bsc')
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
    app.on('second-instance', (event, commandLine) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
           if (mainWindow.isMinimized()) mainWindow.restore()
           mainWindow.focus()
        }
        // the commandLine is array of strings in which last element is deep link url
        // the url str ends with /
        mainWindow.webContents.send("appDeepUrl", commandLine.pop())
        console.log(commandLine)
    })

    // Create mainWindow, load the rest of the app, etc...
    // app.whenReady().then(() => {
    //   createWindow()
    // })
}

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

ipcMain.on ("appReqClearCache", (event, args) => {
    bscpath = process.env.APPDATA + "\\"+ "bettersoundcloud";
	fs.rmSync(bscpath, {recursive: true, force: true });
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
