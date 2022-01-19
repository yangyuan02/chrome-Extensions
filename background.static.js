(function () {
    window.wnd2HwndDict = {}

    window.addEventListener('load', onLoad, false)
    function onLoad() {
        window.removeEventListener('load', onLoad, false)
        chrome.windows.getAll({ populate: false }, function (wnds) {
            let wndsCount = 0
            let lastWndId = 0
            for (const wnd of wnds) {
                if (wnd.type === "normal" || wnd.type === "popup") {
                    if (++wndsCount === 2)
                        break
                    lastWndId = wnd.id
                }
            }
            if (wndsCount === 1) {
                nativeHost.request('NotifyWindowCreated', lastWndId)
            }
            else {
                console.error("[ShadowBot]在扩展初始化时存在多个窗口，无法唯一定位，请关闭所有chrome窗口后重试")
            }
        })
        chrome.windows.onCreated.addListener(function (wnd) {
            nativeHost.request('NotifyWindowCreated', wnd.id)
        })
        chrome.windows.onRemoved.addListener(function (wndId) {
            nativeHost.request('NotifyWindowRemoved', wndId)
            delete wnd2HwndDict[wndId]
        })
    }

    chrome.runtime.onInstalled.addListener(onInstalled)
    function onInstalled() {
        function isChromeTabUrl(url) {
            return url && url.indexOf("chrome://") === 0
        }
        try {
            chrome.tabs.query({}, function (tabsList) {
                for (var i in tabsList) {
                    if (!isChromeTabUrl(tabsList[i].url)) {
                        chrome.tabs.reload(tabsList[i].id, {});
                    }
                }
            });
        } catch (e) {
            console.error("ShadowBot Exception: " + e);
            return;
        }
    }

    const nativeHost = new function () {

        const handlers = {
            'Window.SetHwnd': (params) => {
                wnd2HwndDict[params['wndId']] = params['hwnd']
            },
            'KeepAlive': () => {
                nativeHost.response({
                    content: 'KeepAlive'
                })
            },
            'Extension.GetVersion': () => {
                nativeHost.response({
                    content: window.uiaDispatcher === undefined ? '' : uiaDispatcher.backgroundVersion
                })
            },
            'Extension.Init': (params) => {
                try {
                    eval.call(window, params.code)
                    nativeHost.response({
                        content: null
                    })
                } catch (error) {
                    nativeHost.response({
                        error: {
                            code: -1,
                            message: error.stack
                        }
                    })
                    console.warn('extension init fail', error)
                }
            }
        }

        const conn = chrome.runtime.connectNative("shadowbot.chrome.bridge")
        conn.onMessage.addListener((message) => {
            if (message) {
                if (handlers[message.method] !== undefined) {
                    handlers[message.method].call(window, message.params)
                } else {
                    uiaDispatcher.invoke(message, (response) => {
                        conn.postMessage(response);
                    })
                }
            } else {
                console.error(`未知的消息格式, ${message}`)
            }
        })

        this.request = (method, params) => {
            conn.postMessage({
                method: method,
                params: params
            })
        }

        this.response = (result) => {
            conn.postMessage({
                code: 200,
                status: 'OK',
                result: result
            })
        }
    }
})()
