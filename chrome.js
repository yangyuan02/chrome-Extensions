(function() {
    const BG_CODE_VERSION = 'f408ef67d0d78ceb6a1a38eb64709621'

    const UIAERROR_CODE = {
        ValidationFail: -2, // 参数验证失败
        Unknown: -1, // 未知异常
        Common: 1, // 通用异常
        UnHandle: 0, // 未处理异常 
        UIDriverConnectionError: 9, // UIDriver连接错误
        CEFBrowserConnectionError: 10, // 内置浏览器连接异常
        ChromeBridgeConnectionError: 11, // ChromeBridge进程连接错误
        NoChromeBridgeError: 12, // 尚未安装Chrome插件
        NonsupportOperation: 13, // 元素不支持此自动化操作
        MobileDeviceManagerConnectionError: 14,    //无法连接到手机管理器
        NoJavaExtensionError: 15, // 尚未安装Java插件
        JsDialogOpened: 16, // 出现JavaScript弹框
        NoSuchWindow: 100, // 未找到窗口
        NoSuchElement: 101, // 未找到元素
        NoSuchFrame: 102, // 未找到域
        PageIsLoading: 103, // 网页尚未加载完成
        FrameIsLoading: 104, // 网页中的Frame尚未加载完成
        JavaScriptError: 105, // JavaScript执行出错
        NoSuchElementID: 106, // 未找到元素指定的元素ID（缓存失效）
        NoSuchImage: 107, // 未找到图像
        Timeout: 108, // 操作超时
        AIError: 109, // AI识别错误
        DriverInputError: 110, // 无法通过驱动模拟按键输入
        CDPMethodNotFound: 111 // 未找到CDP的方法
    }

    let contentScript = null

    class UIAError extends Error {
        constructor(code, message) {
            super(message || "")
            this.code = code
        }
    }

    //#region api
    class WebNavigationApi {
        getAllFrames(tabId) {
            return new Promise((resolve, reject) => {
                chrome.webNavigation.getAllFrames({
                    tabId: tabId
                }, (details) => {
                    resolve(details)
                })
            })
        }
    }

    class WindowsApi {
        update(windowId, updateInfo) {
            return new Promise((resolve, reject) => {
                chrome.windows.update(windowId, updateInfo, (wnd) => {
                    resolve(wnd)
                })
            })
        }
        getCurrent() {
            return new Promise((resolve, reject) => {
                chrome.windows.getCurrent(null, (wnd) => {
                    resolve(wnd)
                })
            })
        }
    }

    class TabsApi {
        create(createProperties) {
            return new Promise((resolve, reject) => {
                chrome.tabs.create(createProperties, (tab) => {
                    resolve(tab)
                })
            })
        }
        query(queryInfo) {
            return new Promise((resolve, reject) => {
                chrome.tabs.query(queryInfo, (tabs) => {
                    resolve(tabs)
                })
            })
        }
        update(tabId, updateInfo) {
            return new Promise((resolve, reject) => {
                chrome.tabs.update(tabId, updateInfo, (tab) => {
                    resolve(tab)
                })
            })
        }
        get(tabId) {
            return new Promise((resolve, reject) => {
                chrome.tabs.get(tabId, (tab) => {
                    resolve(tab)
                })
            })
        }
        reload(tabId, bypassCache) {
            return new Promise((resolve, reject) => {
                chrome.tabs.reload(tabId, {
                    bypassCache: bypassCache
                }, () => {
                    resolve()
                })
            })
        }
        goForward(tabId) {
            return new Promise((resolve, reject) => {
                chrome.tabs.goForward(tabId, () => {
                    resolve()
                })
            })
        }
        goBack(tabId) {
            return new Promise((resolve, reject) => {
                chrome.tabs.goBack(tabId, () => {
                    resolve()
                })
            })
        }
        remove(tabIds) {
            return new Promise((resolve, reject) => {
                chrome.tabs.remove(tabIds, () => {
                    resolve()
                })
            })
        }
        getZoom(tabId) {
            return new Promise((resolve, reject) => {
                chrome.tabs.getZoom(tabId, (zoomFactor) => {
                    resolve(zoomFactor)
                })
            })
        }
        executeScriptOnFrame(tabId, frameId, code) {
            return new Promise((resolve, reject) => {
                const details = {
                    code: code,
                    frameId: frameId, //The frame where the script or CSS should be injected. Defaults to 0 (the top-level frame).
                    matchAboutBlank: true
                }

                if (window.opendDialogTabs && opendDialogTabs.indexOf(tabId) > -1)
                    reject(new UIAError(UIAERROR_CODE.JsDialogOpened, `页面出现JavaScript弹框，请先关闭弹框再操作`))

                chrome.tabs.executeScript(tabId, details, (result) => {
                    // result存在以下三种情况:
                    // 1. 正常执行返回数组(因为指定了frameId，所以数组中只有一项)
                    // 1.1 有返回值即是数组中的第一项
                    // 1.2 无返回值数组的第一项为null
                    // 2. Javascript执行失败，返回数组，且第一项为null，同1.2
                    // 3. 发生跨域错误，这时需要对chrome.runtime.lastError添加判断，否则会在控制台打印错误信息
                    if (chrome.runtime.lastError) {
                        reject(new UIAError(UIAERROR_CODE.Common, chrome.runtime.lastError.message))
                    } else {
                        if (Array.isArray(result) && result.length == 1) {
                            resolve(result[0])
                        } else {
                            reject(new UIAError(UIAERROR_CODE.JavaScriptError, `${frameId} execute script fail.`))
                        }
                    }
                })
            })
        }
    }

    class DownloadApi {
        download(options) {
            return new Promise((resolve, reject) => {
                chrome.downloads.download(options, (downloadId) => {
                    resolve(downloadId)
                })
            })
        }
        search(query) {
            return new Promise((resolve, reject) => {
                chrome.downloads.search(query, (results) => {
                    resolve(results)
                })
            })
        }
    }

    class CookiesApi {
        getAll(details) {
            return new Promise((resolve, reject) => {
                chrome.cookies.getAll(details, (cookies) => {
                    resolve(cookies)
                })
            })
        }
    }

    class DebuggerApi {
        attach(tabId, version) {
            return new Promise((resolve, reject) => {
                chrome.debugger.attach({ tabId }, version || '1.2', () => {
                    resolve()
                })
            })
        }

        detach(tabId) {
            return new Promise((resolve, rejcet) => {
                chrome.debugger.detach({ tabId }, () => {
                    resolve()
                })
            })
        }

        getTargets() {
            return new Promise((resolve, reject) => {
                chrome.debugger.getTargets((result) => {
                    resolve(result)
                })
            })
        }

        sendCommand(tabId, method, commandParam) {
            return new Promise((resolve, reject) => {
                chrome.debugger.sendCommand({ tabId }, method, commandParam, (result) => {
                    resolve(result)
                })
            })
        }

        sendCommandNoWaitResponse(tabId, method, commandParam) {
            chrome.debugger.sendCommand({ tabId }, method, commandParam)
        }

        onEvent(callback) {
            chrome.debugger.onEvent.addListener(callback)
        }

        onDetach(callback) {
            chrome.debugger.onDetach.addListener(callback)
        }
        }
    //#endregion

    //#region func
    function clone(obj) {
        let copy
        if (null == obj || 'object' != typeof(obj)) return obj; //a==b vs b==a?
        if (obj instanceof Date) {
            copy = new Date()
            copy.setTime(obj.getTime())
            return copy
        }
        if (obj instanceof Array) {
            copy = []
            obj.forEach(ele => {
                copy.push(ele)
            })
            return copy
        }
        if (obj instanceof Object) {
            copy = {}
            for (const attr in obj) {
                if (obj.hasOwnProperty(attr)) {
                    copy[attr] = clone(obj[attr])
                }
            }
            return copy
        }
        throw new Error("copy type is not supported.")
    }

    function pointClientToPage(pointLike, zoom) {
        pointLike.x /= zoom
        pointLike.y /= zoom
    }

    function rectPageToClient(rectLike, zoom) {
        rectLike.x = Math.round(rectLike.x * zoom)
        rectLike.y = Math.round(rectLike.y * zoom)
        rectLike.width = Math.round(rectLike.width * zoom)
        rectLike.height = Math.round(rectLike.height * zoom)
    }

    function getFrameByElementUid(uid) { //fid|sequence:tagType
        const tokens = uid.split('|')
        if (tokens.length != 2)
            throw new UIAError(UIAERROR_CODE.ValidationFail, `指定的元素ID无效, ${uid}`)
        return parseInt(tokens[0])
    }

    async function requestOnFrame(tabId, frameId, originalMethod, params) {
        // response:
        // {
        //     status: success(成功), tunneling(跨域隧道), bubbling(跨域冒泡), needInit(需要代码注入), failure(失败), undefined / null
        //         {
        //             存在下面五种情况:
        //             1.success: 成功 { status: 'success', result: result }
        //             2.tunneling: 继续下次Frame请求(跨域) { status: 'tunneling', route: { frameIndex: 111, params: params } }
        //                 route.params存储了上一次请求的结构
        //             3.bubbling: 继续下次Frame请求(跨域) { status: 'bubbling', route: { frameIndex: 111, params: params } }
        //                 route.params存储了上一次请求的结构
        //             4.needInit: content需要初始化 { status: 'needInit', message: 'content need init' }
        //             5.fail: 请求失败
        //                 {
        //                      failure(ActionError) : { status: 'failure', error: { code: code(1), message: message } }
        //                      failure              : { status: 'failure', error: { code: code(-1), message: message } }
        //                      uiaFailure(UIAError) : { status: 'uiafailure', error: { code: code, message: message } }
        //                 }
        //             6.undefined/null: content script注入失败(出现在某些about:blank页面) 
        //         }
        // }
        if (!params) {
            params = {}
        }
        //为params添加必要参数 codeVersion && frameId
        if (!params.contentVersion) {
            params.contentVersion = BG_CODE_VERSION
        }
        params.frameId = frameId
        const code = `window.invoke && invoke('${originalMethod}',${JSON.stringify(params)})`
        const response = await new TabsApi().executeScriptOnFrame(tabId, frameId, code)
        if (!response) { //undefined/null
            return null
        } else if (response.status == 'success') { //成功
            return response.result
        } else if (response.status == 'tunneling') { //Tunneling
            let details = await new WebNavigationApi().getAllFrames(tabId)
            for (const detail of details) {
                //detail.frameId : The ID of the parent frame, or -1 if this is the main frame.  (用===判断)
                //会存在frame的url是blank的情况，不会进catch (Cannot access "about:blank" at origin "null")在这里过滤掉
                if (detail.parentFrameId === frameId) {
                    try {
                        //get tunnel frame && retry in tunnel frame
                        let frameIndex = await requestOnFrame(tabId, detail.frameId, 'getFrameIndex')
                        if (frameIndex == response.route.frameIndex) {
                            return await requestOnFrame(tabId, detail.frameId, originalMethod, response.route.args)
                        }
                    } catch (e) {
                        if (e.code === UIAERROR_CODE.Common || detail.url === 'about:blank') {
                            continue // 忽略跨域 和 about:blank 异常
                        } else {
                            throw e
                        }
                    }
                }
            }
        } else if (response.status == 'bubbling') { //bubbling
            let details = await new WebNavigationApi().getAllFrames(tabId)
            for (const detail of details) {
                //detail.frameId : The ID of the current frame, or -1 if this is the main frame.  (用===判断)
                if (detail.frameId === frameId) {
                    return await requestOnFrame(tabId, detail.parentFrameId, originalMethod, response.route.args)
                }
            }
        } else if (response.status == 'needInit') { //content need init
            //init contentScript
            await requestOnFrame(tabId, frameId, 'init', {
                    code: contentScript
                })
                //update frameBackendId
            const backendCode = `uiaDispatcher.frameBackendId = ${frameId}`
            await new TabsApi().executeScriptOnFrame(tabId, frameId, backendCode)
                //retry and return
            return await requestOnFrame(tabId, frameId, originalMethod, params)
        } else if (response.status == 'uiafailure' || response.status == 'failure') {
            throw new UIAError(response.error.code, response.error.message)
        }
        throw new UIAError(UIAERROR_CODE.JavaScriptError, `fail on RequestOnFrame , ${originalMethod}`)
    }

    function filterOutEmptyProperties(obj) {
        const filtObj = {}
        for (const propName in obj) {
            const prop = obj[propName]

            if (prop !== '' && prop !== null && prop !== undefined) {
                filtObj[propName] = prop
            }
        }
        return filtObj
    }
    //#endregion

    //#region handler
    class Handler {
        async invoke(message) {
            const result = await this[message.method.split('.')[1]](message.params)
            return result
        }
    }

    class Chrome extends Handler {
        async getWindowId(params) {
            // {
            //     hWnd: 34252435
            // }
            for (const [windowId, windowHwnd] of Object.entries(wnd2HwndDict)) {
                if (params.hWnd == windowHwnd) {
                    return windowId;
                }
            }
        }
        async create(params) {
            // {
            //     url: '...'
            // }
            const tab = await new TabsApi().create({
                url: params.url
            })
            return tab.id
        }
        async query(queryParams) { //https://developer.chrome.com/extensions/tabs#method-query
            // {
            //     active: true,
            //     url: '...',
            //     ...
            // }
            const tabs = await new TabsApi().query(queryParams)
            const tabIds = []
            for (const tab of tabs) {
                // TabStatus非"complete" 状态下 url==="", 作为正常 tab页返回
                if (tab.url === "" || (tab.url && tab.url.indexOf("chrome://") !== 0)) {
                    tabIds.push(tab.id)
                }
            }
            return tabIds
        }
        async getTab(getParams) {
            // {
            //     tabId: 1
            // }
            const tab = await new TabsApi().get(getParams.tabId)
            if (chrome.runtime.lastError) {
                throw new UIAError(UIAERROR_CODE.Common, `获取tab失败, ${chrome.runtime.lastError.message}`)
            } else {
                return tab
            }
        }
        async closeAll(params) {
            const tabs = await new TabsApi().query({})
            const tabIds = tabs.map(m => m.id)
            await new TabsApi().remove(tabIds)
            if (chrome.runtime.lastError) {
                throw new UIAError(UIAERROR_CODE.Common, `关闭所有tab失败, ${chrome.runtime.lastError.message}`)
            }
            //clear debugger info
            debuggerManager.deleteAll()
        }
        async initContentScript(scriptParams) {
            // {
            //     code: ...
            // }
            contentScript = scriptParams.code
        }
    }

    class Window extends Handler {
        constructor(windowId) {
            super()
            this.windowId = windowId
        }

        async update(params) {
            // {
            //     windowId: 123
            //     updateInfo: https://developers.chrome.com/extensions/windows#method-update
            // }
            await new WindowsApi().update(this.windowId, params.updateInfo)
        }
    }

    class Browser extends Handler {
        constructor(tabId) {
            super()
            this.tabId = tabId
        }

        async getWindowInfo(params) {
            // {
            //     tabId: 1
            // }
            const tab = await new TabsApi().get(this.tabId)
            const winHwnd = wnd2HwndDict[tab.windowId]
            return {
                id: tab.windowId,
                hWnd: winHwnd
            }
        }
        async active() {
            // {
            //     tabId = 1
            // }
            const tab = await new TabsApi().get(this.tabId)
            await new WindowsApi().update(tab.windowId, {
                focused: true
            })
            await new TabsApi().update(tab.id, {
                active: true
            })
        }
        async reload(reloadParams) {
            // {
            //     tabId: 1
            //     bypassCache: false
            // }
            await new TabsApi().reload(this.tabId, reloadParams.bypassCache)
        }
        async navigate(navParams) {
            // {
            //     tabId: 1
            //     url: '...'
            // }
            await new TabsApi().update(this.tabId, {
                url: navParams.url
            })
        }
        async goForward() {
            // {
            //     tabId: 1
            // }
            await new TabsApi().goForward(this.tabId)
        }
        async goBack() {
            // {
            //     tabId: 1
            // }
            await new TabsApi().goBack(this.tabId)
        }
        async close() {
            // {
            //     tabId = 123
            // }
            await new TabsApi().remove([this.tabId])
            if (chrome.runtime.lastError) {
                throw new UIAError(UIAERROR_CODE.Common, `关闭tab失败, ${chrome.runtime.lastError.message}`)
            }
            //clear debugger info
            debuggerManager.delete(this.tabId)
        }
        async isLoadCompleted() {
            // {
            //     tabId = 123
            // }
            const tab = await new TabsApi().get(this.tabId)
            if (chrome.runtime.lastError) {
                return false
            }
            return tab.status === 'complete'
        }
        async activate() {
            // {
            //     tabId = 1
            // }
            const tab = await new TabsApi().get(this.tabId)
            if (chrome.runtime.lastError) {
                throw new UIAError(UIAERROR_CODE.Common, `获取tab失败, ${chrome.runtime.lastError.message}`)
            } else {
                await new WindowsApi().update(tab.windowId, {
                    focused: true
                })
                await new TabsApi().update(tab.id, {
                    active: true
                })
            }
        }
        async getTitle() {
            // {
            //     tabId: 1
            // }
            const tab = await new TabsApi().get(this.tabId)
            if (chrome.runtime.lastError) {
                throw new UIAError(UIAERROR_CODE.Common, `获取tab失败, ${chrome.runtime.lastError.message}`)
            } else {
                return tab.title
            }
        }
        async getUrl() {
            // {
            //     tabId: 1
            // }
            const tab = await new TabsApi().get(this.tabId)
            if (chrome.runtime.lastError) {
                throw new UIAError(UIAERROR_CODE.Common, `获取tab失败, ${chrome.runtime.lastError.message}`)
            } else {
                return tab.url
            }
        }
        async getInfo() {
            // {
            //     tabId: 1
            // }
            const tab = await new TabsApi().get(this.tabId)
            if (chrome.runtime.lastError) {
                throw new UIAError(UIAERROR_CODE.Common, `获取tab失败, ${chrome.runtime.lastError.message}`)
            } else {
                return {
                    url: tab.url,
                    title: tab.title,
                    active: tab.active
                }
            }
        }
        async getText() {
            // {
            //     tabId: 123,
            // }
            const code = 'document.documentElement.outerText'
            return await new TabsApi().executeScriptOnFrame(this.tabId, 0, code)
        }
        async getHtml() {
            // {
            //     tabId: 123,
            // }
            const code = 'document.documentElement.outerHTML'
            return await new TabsApi().executeScriptOnFrame(this.tabId, 0, code)
        }
        async getViewPortRect() {
            // {
            //     tabId: 1
            // }
            const result = await requestOnFrame(this.tabId, 0, 'getViewPortRect', null)
            return result
        }
        async executeScriptOnFrame(scriptOnFrameParams) {
            // {
            //     tabId: 123,
            //     code: window._uia_temp_function=(console.log("112")),
            // }
            const result = await new TabsApi().executeScriptOnFrame(this.tabId, 0, scriptOnFrameParams.code)
            if (result === undefined || result === null) {
                return null
            } else {
                return JSON.stringify(result)
            }
        }
        async executeJavaScript(javaScriptParams) {
            // {
            //     tabId: 123,
            //     code: xxx,
            //     argument: xxx
            // }
            const result = await requestOnFrame(this.tabId, 0, 'executeJavaScript', javaScriptParams)
            return result
        }
        async scrollTo(scrollToParams) {
            // {
            //     tabId: 1,
            //     location:
            //     behavior:
            //     top:
            //     left:
            // }
            const result = await requestOnFrame(this.tabId, 0, 'scrollTo', scrollToParams)
            return result
        }
        async inspectByPoint(inspectParams) {
            // {
            //     tabId : 0,
            //     x : 1,
            //     y : 2
            // }
            const zoom = await new TabsApi().getZoom()
            pointClientToPage(inspectParams, zoom)
            inspectParams.zoom = zoom
            const result = await requestOnFrame(this.tabId, 0, 'inspectByPoint', inspectParams)
            return result
        }
        async selectorFromPoint(selectorParams) {
            // {
            //     tabId: 1,
            //     x: 1,
            //     y: 1
            // }
            const zoom = await new TabsApi().getZoom()
            pointClientToPage(selectorParams, zoom)
            const result = await requestOnFrame(this.tabId, 0, 'selectorFromPoint', selectorParams)
            return result
        }
        async querySelectorAll(queryAllParams) {
            // {
            //     tabId: 1,
            //     path: SelectorNode Array
            // }
            const result = await requestOnFrame(this.tabId, 0, 'querySelectorAll', queryAllParams)
            return result
        }
        async queryTableSelector(queryTableParams) {
            // {
            //     tabId: 1
            //     selector: tableSelector
            // }
            const result = await requestOnFrame(this.tabId, 0, 'queryTableSelector', queryTableParams.selector)
            return result
        }
        async queryCSSSelectorAll(queryCssParams) {
            // {
            //     tabId: 1
            //     path: cssSelector
            // }
            const result = await requestOnFrame(this.tabId, 0, 'queryCSSSelectorAll', queryCssParams)
            return result
        }
        async queryXPathSelectorAll(xpathQueryParams) {
            // {
            //     tabId: 1
            //     path: xpathSelector
            // }
            const result = await requestOnFrame(this.tabId, 0, 'queryXPathSelectorAll', xpathQueryParams)
            return result
        }
        async selectorFromActive(selectorParams) {
            const result = await requestOnFrame(this.tabId, 0, 'selectorFromActive', selectorParams)
            return result
        }
        async getActiveElement() {
            const result = await requestOnFrame(this.tabId, 0, 'getActiveElement', null)
            return result
        }

        async documentHasFocus(){
            const result = await requestOnFrame(this.tabId, 0, 'documentHasFocus', null)
            return result
        }

        async fetch(requests){ 
            const result = await requestOnFrame(this.tabId, 0, 'fetch', requests)
            return result
        }
        async getScroll(inputParams){
            // {
            //     tabId: 1,
            //     direction:'vertical/horizontal',
            //     location:'current/element'
            // }
            const result = await requestOnFrame(this.tabId, 0, 'getScroll', inputParams)
            return result
        }
    }

    class Element extends Handler {
        constructor(tabId, elementId) {
            super()
            this.tabId = tabId
            this.elementId = elementId
            this.targetFrame = getFrameByElementUid(this.elementId);
        }

        async click(clickParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            //     button: Left = 0,Right = 1,Middle = 2
            //     keys: None = 0,Alt = 1,Ctrl = 2,Shift = 4,Win = 8
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'click', clickParams)
            return result
        }
        async dblClick(dbclickParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'dblClick', dbclickParams)
            return result
        }
        async hover(hoverParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'hover', hoverParams)
            return result
        }
        async input(inputParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            //     value: ...
            //     append: true
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'input', inputParams)
            return result
        }
        async isEditable(edtiableParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'isEditable', edtiableParams)
            return result
        }
        async scrollTo(inputParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            //     value: ...
            //     append: true
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'scrollTo', inputParams)
            return result
        }
        async scrollIntoViewIfNeeded(intoViewParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'scrollIntoViewIfNeeded', intoViewParams)
            return result
        }
        async dragTo(dragParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            //     top: 2
            //     left: 2
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'dragTo', dragParams)
            return result
        }
        async getAllAttributes(allAttributeParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'getAllAttributes', allAttributeParams)
            return result
        }
        async getAttribute(getAttributeParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            //     name: ...
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'getAttribute', getAttributeParams)
            return result
        }
        async getHtml(getHtmlParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'getHtml', getHtmlParams)
            return result
        }
        async getText(getTextParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'getText', getTextParams)
            return result
        }
        async getBaseTableValue(tableBaseParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'getBaseTableValue', tableBaseParams)
            return result
        }
        async getValue(getValueParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'getValue', getValueParams)
            return result
        }
        async setAttribute(setAttributeParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            //     name: ...
            //     value: ...
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'setAttribute', setAttributeParams)
            return result
        }
        async setValue(setValueParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            //     value: ...
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'setValue', setValueParams)
            return result
        }
        async focus(focuseParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'focus', focuseParams)
            return result
        }
        async parent(parentParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'parent', parentParams)
            return result
        }
        async children(childParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'children', childParams)
            return result
        }
        async nextSibling(siblingParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'nextSibling', siblingParams)
            return result
        }
        async tableParentSelectorInFrame(tableParentSelectorParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'tableParentSelectorInFrame', tableParentSelectorParams)
            return result
        }
        async check(checkParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            //     mode: Check = 0,Uncheck = 1,Toggle = 2
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'check', checkParams)
            return result
        }
        async isChecked(isCheckedParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'isChecked', isCheckedParams)
            return result
        }
        async isEnabled(isEnabledParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'isEnabled', isEnabledParams)
            return result
        }
        async isDisplayed(isDisplayedParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'isDisplayed', isDisplayedParams)
            return result
        }
        async select(selectParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            //     item: ...
            //     mode: Fuzzy = 0,Exact = 1,Regex = 2
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'select', selectParams)
            return result
        }
        async selectMultiple(selectMultipleParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            //     items: [.. , ..]
            //     mode: Fuzzy = 0,Exact = 1,Regex = 2
            //     append: true
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'selectMultiple', selectMultipleParams)
            return result
        }
        async selectByIndex(selectByIndexParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            //     index: 0
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'selectByIndex', selectByIndexParams)
            return result
        }
        async selectMultipleByIndex(selectMultipleByIndexParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            //     indexes: [0,1]
            //     append: true
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'selectByIndex', selectMultipleByIndexParams)
            return result
        }
        async getSelectOptions(getSelectOptionsParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'getSelectOptions', getSelectOptionsParams)
            return result
        }
        async getTable(getTableParams) {
            // {
            //     tabId: 1,
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'getTable', getTableParams)
            return result
        }
        async getBounding(getBoundParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const zoom = await new TabsApi().getZoom()
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'getBounding', getBoundParams)
            rectPageToClient(result, zoom)
            return result
        }
        async pathFromMainFrameByElementId(fullPathParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'pathFromMainFrameByElementId', fullPathParams)
            return result
        }
        async executeJavaScript(javaScriptParams) {
            // {
            //     tabId: 123,
            //     elementId: fid|sequence:tagType
            //     code: xxx,
            //     argument: xxx
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'executeJavaScript', javaScriptParams)
            return result
        }
        async executeJavaScriptAsync(jsAsyncParams) {
            // {
            //     tabId: 123,
            //     elementId: fid|sequence:tagType
            //     code: temp_function,
            // }
            const result = await new TabsApi().executeScriptOnFrame(this.tabId, this.targetFrame, jsAsyncParams.code)
            return result
        }
        async querySelectorAll(querySelectorAllParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            //     path: [selectorNode]
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'querySelectorAll', querySelectorAllParams)
            return result
        }
        async queryCSSSelectorAll(queryCSSSelectorAllParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            //     path: ...str
            // }
            const result = await requestOnFrame(queryCSSSelectorAllParams.tabId, this.targetFrame, 'queryCSSSelectorAll', queryCSSSelectorAllParams)
            return result
        }
        async queryXPathSelectorAll(XPathSelectorAllParams) {
            // {
            //     tabId: 1
            //     elementId: fid|sequence:tagType
            //     path: ...str
            // }
            const result = await requestOnFrame(XPathSelectorAllParams.tabId, this.ytargetFrame, 'queryXPathSelectorAll', XPathSelectorAllParams)
            return result
        }
        async getScroll(inputParams){
            // {
            //     tabId: 1,
            //     elementId: fid|sequence:tagType
            //     direction:'vertical/horizontal',
            //     location:'current/element'
            // }
            const result = await requestOnFrame(this.tabId, this.targetFrame, 'getScroll', inputParams)
            return result
        }
    }

    class Download extends Handler {
        constructor() {
            super()
        }

        async downloadUrl(downloadParams) {
            // {
            //     suggestFilename: 'xxx'
            //     url: '...' 
            // }
            const downloadId = await new DownloadApi().download({ url: downloadParams.url })
            return downloadId
        }
        async search(searchParams) {
            return await new DownloadApi().search(searchParams)
        }
    }

    class Cookies extends Handler {
        constructor() {
            super()
        }

        async getAll(cookieParams) {
            // {
            //     url: 'cookies url' 
            //     name: 'cookies name' 
            //     domain: 'cookies domain' 
            //     path: 'cookies path' 
            // }
            //不能直接
            const params = filterOutEmptyProperties(cookieParams)
            const cookies = await new CookiesApi().getAll(params)
            if (chrome.runtime.lastError) {
                throw new UIAError(UIAERROR_CODE.Common, `获取浏览器Cookies失败, ${chrome.runtime.lastError.message}`)
            } else {
                const options = {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: 'numeric',
                    second: 'numeric',
                    hour12: false,
                    timeZone: 'America/Los_Angeles'
                };

                for (const cookie of cookies) {
                    const expires = cookie.expirationDate
                    if (expires) {
                        const date = new Date(expires * 1000)
                        cookie.expirationDate = new Intl.DateTimeFormat('default', options).format(date)
                    }
                }
                return cookies
            }
        }
    }

    class Debugger extends Handler {
        constructor(tabId) {
            super()
            this._connected = false
            this.tabId = tabId
            this.debuggerApi = new DebuggerApi()
            this.events = new Set();
            this.eventHandlers = new Map()
        }

        async attach(param) {
            if (this._connected) return
            await this.debuggerApi.attach(this.tabId, param.version);
            if (chrome.runtime.lastError) {
                let message = chrome.runtime.lastError.message;
                if (message.indexOf('debugger is already attached') < 0)
                    throw new UIAError(UIAERROR_CODE.Common, `启动Debugger失败, ${message}`)
            }
            this._connected = true
                //enable domain
            await this.sendCommand({ method: 'Page.enable', commandParam: {} })
            await this.sendCommand({ method: 'Runtime.enable', commandParam: {} })
        }

        async detach(param) {
            await this.debuggerApi.detach(this.tabId)
            if (chrome.runtime.lastError) {
                let message = chrome.runtime.lastError.message;
                if (message.indexOf('Detached while handling command') < 0)
                    throw new UIAError(UIAERROR_CODE.Common, `关闭Debugger失败, ${message}`)
            }
            this._connected = false
        }

        async sendCommand(param) {
            await this.attach(param)
            const result = await this.debuggerApi.sendCommand(this.tabId, param.method, param.commandParam)
            if (chrome.runtime.lastError) {
                let code = chrome.runtime.lastError.code
                if (code == -32601)
                    throw new UIAError(UIAERROR_CODE.CDPMethodNotFound, `当前浏览器版本不支持此操作，请升级到最新版本再尝试`)
                throw new UIAError(UIAERROR_CODE.Common, `执行Debugger命令[${param.method}]失败, 参数[${param.commandParam}], ${chrome.runtime.lastError.message}`)
            }
            return result
        }

        async sendCommandNoWaitResponse(param) {
            await this.attach(param)
            this.debuggerApi.sendCommandNoWaitResponse(this.tabId, param.method, param.commandParam)
            if (chrome.runtime.lastError) {
                let code = chrome.runtime.lastError.code
                if (code == -32601)
                    throw new UIAError(UIAERROR_CODE.CDPMethodNotFound, `当前浏览器版本不支持此操作，请升级到最新版本再尝试`)
                throw new UIAError(UIAERROR_CODE.Common, `执行Debugger命令[${param.method}]失败, 参数[${param.commandParam}], ${chrome.runtime.lastError.message}`)
            }
        }

        async addEventHandler(param) {
            // {
            //     method: 'Network.getResponseBody' 
            // }
            let token = param.method.split('.');
            let eventHandler = this.eventHandlers.get(token[0])
            if (!eventHandler) {
                switch (token[0]) {
                    case 'Page':
                        eventHandler = new PageEventHandler()
                        break;
                    case 'Network':
                        eventHandler = new NetWorkEventHandler();
                        break;
                }
                if (eventHandler == null)
                    return

                this.eventHandlers.set(token[0], eventHandler);
            }
            this.events.add(param.method);
        }

        async removeEventHandler(param) {
            // {
            //     method: 'Network.getResponseBody' 
            // }
            let token = param.method.split('.');
            let eventHandler = this.eventHandlers.get(token[0])

            if (typeof eventHandler.dispose === 'function') {
                eventHandler.dispose()
            }

            this.eventHandlers.delete(token[0])
            this.events.delete(param.method)
        }

        async getNetWorkItemQueue() {
            let networkHandler = this.eventHandlers.get('Network')
            var queue = networkHandler.queue
            return queue
        }

        onDetach() {
            //监听的是因外在原因关闭，比如手工关闭正在调试的BAR，直接通过debugger.detach,不会触发
            this._connected = false
        }
    }

    class PageEventHandler {
        constructor() {
            this.showingJSDialog = false
            this.jsDialogText = ""
            }

        init(name) { }

        javascriptDialogOpening(params) {
            this.showingJSDialog = true
            this.jsDialogText = params.message
        }

        javascriptDialogClosed(params) {
            this.showingJSDialog = false
    }
    }

    class NetWorkEventHandler {
        constructor() {
            this.queue = []
            this.limit = 200
        }

        responseReceived(param) {
            this.queue.push(new NetWorkItem(param.requestId, param.response.url, param.type, param.response.status, param.response.headers))

            if (this.queue.length > this.limit) {
                this.queue.shift()
            }
        }

        dispose() {
            this.queue = []
        }
    }

    class NetWorkItem {
        constructor(requestId, url, type, status, headers) {
            this.requestId = requestId
            this.url = url
            this.type = type
            this.status = status
            this.headers = headers
        }
    }

    window.debuggerManager = new function () {
        this.debuggers = new Map()

        this.init = function () {
            this.onEvent()
            this.onDetach()
        }

        this.get = function (tabId) {
            let debuggee = this.debuggers.get(tabId)
            if (!debuggee) {
                debuggee = new Debugger(tabId)
                this.debuggers.set(tabId, debuggee);
            }
            return debuggee
        }

        this.delete = function (tabId) {
            this.debuggers.delete(tabId)
        }

        this.deleteAll = function () {
            this.debuggers.clear()
        }

        // 添加 onEvent callback: chrome.debugger.onEvent.addListener
        this.onEvent = function () {
            if (chrome.debugger) {
                let self = this
                new DebuggerApi().onEvent((debuggeeId, method, params) => {
                    let debuggee = self.get(debuggeeId.tabId)
                    if (debuggee.events.has(method)) {
                        let token = method.split('.')
                        let eventHandler = debuggee.eventHandlers.get(token[0])
                        if (eventHandler != null)
                            eventHandler[token[1]](params);
                    }
                })
            }
        }

        this.onDetach = function () {
            if (chrome.debugger) {
                let self = this
                new DebuggerApi().onDetach((debuggeeId, reason) => {
                    let debuggee = self.get(debuggeeId.tabId)
                    if (debuggee)
                        debuggee.onDetach()
                })
            }
        }
    }
    window.debuggerManager.init();

    class HandlerFactory {
        generateHandler(message) {
            let handler = null;
            let token = message.method.split('.')[0]
            if (token == 'chrome') {
                handler = new Chrome()
            } else if (token == 'window') {
                handler = new Window(message.params.windowId)
            } else if (token == 'browser') {
                handler = new Browser(message.params.tabId)
            } else if (token == 'element') {
                handler = new Element(message.params.tabId, message.params.elementId)
            } else if (token == 'debugger') {
                handler = window.debuggerManager.get(message.params.tabId)
            } else if (token == "download") {
                handler = new Download()
            } else if (token == "cookies") {
                handler = new Cookies()
            } else {
                throw new UIAError(UIAERROR_CODE.ValidationFail, `未知的消息格式' , ${handler}`)
            }
            return handler
        }
    }
    //#endregion

    window.uiaDispatcher = new function() {

        //code:200,status:'ok',result:{content,error}
        const response = {
            ok: (content) => {
                return {
                    code: 200,
                    status: 'ok',
                    result: {
                        content: content,
                        error: null
                    }
                }
            },
            fail: (code, message) => {
                return {
                    code: 200,
                    status: 'ok',
                    result: {
                        content: null,
                        error: {
                            code: code,
                            message: message
                        }
                    }
                }
            }
        }

        this.backgroundVersion = BG_CODE_VERSION
        this.invoke = function(message, callback) {
            try {
                if (message.method.split('.').length != 2)
                    callback(response.fail('未知的消息格式', message.method))
                const handler = new HandlerFactory().generateHandler(message);
                handler.invoke(message)
                    .then((value) => {
                        callback(response.ok(value))
                    }).catch((reason) => {
                        callback(response.fail(reason.code, reason.message))
                    })
            } catch (reason) {
                callback(response.fail('error unknow', reason.stack))
            }
        }
    }
})();