(function () {
    if (!window.uiaMetadata) {
        window.uiaMetadata = {
            uidKey: 'uia-uid',
            latestUid: 0
        }
    }

    const TAGS = {
        BODY: 'BODY',
        TABLE: 'TABLE',
        INPUT: 'INPUT',
        BUTTON: 'BUTTON',
        SELECT: 'SELECT',
        LABEL: 'LABEL',
        TEXTAREA: 'TEXTAREA',
        IFRAME: 'IFRAME',
        FRAME: 'FRAME',
        A: 'A',
        IMG: 'IMG'
    }

    const CLICK_TYPE = {
        CLICK: 0,
        RIGHT_CLICK: 1,
        DOUBLE_CLICK: 2,
        MIDDLE_CLICK: 3,
        HOVER: 4
    }

    // sync with enum KeyModifiers
    const KEY_MODIFIERS = {
        NONE: 0,
        ALT: 1,
        CTRL: 2,
        SHIFT: 4
    }

    const CHECK_MODE = {
        CHECK: 0,
        UNCHECK: 1,
        TOGGLE: 2
    }

    const MATCH_MODE = {
        FUZZY: 0,
        EXACT: 1,
        REGEX: 2
    }

    const UIAERROR_CODE = {
        ValidationFail: -2, // 参数验证失败
        Unknown: -1, // 未知异常
        Common: 1, // 通用异常
        UIDriverConnectionError: 9, // UIDriver连接错误
        CEFBrowserConnectionError: 10, // CEF浏览器连接错误
        NonsupportOperation: 13, // 元素不支持此操作
        NoSuchWindow: 100, // 未找到窗口
        NoSuchElement: 101, // 未找到元素
        NoSuchFrame: 102, // 未找到Frame
        PageIsLoading: 103, // 网页尚未加载完成
        FrameIsLoading: 104, // 网页中的Frame尚未加载完成
        JavaScriptError: 105, // JavaScript执行出错
        NoSuchElementID: 106, // 未找到元素指定的元素ID（缓存失效）
    }

    const SCROLL_BEHAVIOR = {
        AUTO: 'auto',
        SMOOTH: 'smooth'
    }

    const NBSP_REGEXP = new RegExp(String.fromCharCode(160), "g")

    const domUtils = new function () {
        this.matchElementType = (ele, ...tags) => {
            if (!!ele && ele.nodeType === Node.ELEMENT_NODE) {
                const curTag = domUtils.getTagName(ele).toUpperCase()
                for (const tag of tags) {
                    if (tag === curTag) {
                        return true
                    }
                }
            }
            return false
        }

        this.findAncestor = (ele, condition, includeSelf = true) => {
            let cur = ele
            while (cur) {
                if (cur && (includeSelf || cur !== ele) && condition(cur) === true)
                    return cur
                cur = cur.parentElement
            }
            return null
        }

        this.getSmoothScrollContainer = (ele) => {
            let cur = ele.parentElement
            do {
                let inlineBehavior = cur.style.scrollBehavior //默认为 ""  除非scrolling box inline显示设置 scroll-behavior style 
                let computedBehavior = getComputedStyle(cur).scrollBehavior //默认为"auto" 除非在css样式中设置 scroll-behavior: smooth
                let currentBehavior = inlineBehavior || computedBehavior
                if (currentBehavior.toLowerCase() === SCROLL_BEHAVIOR.SMOOTH) {
                    return cur
                } else {
                    cur = cur.parentElement
                }
            } while (cur && !domUtils.matchElementType(cur, TAGS.IFRAME, TAGS.FRAME))
            return null
        }

        this.updateContainerScrollBehavior = (container, updateBehavior) => {
            container.style.scrollBehavior = updateBehavior
        }

        //从dom element对象上获取eid属性，如果不存在就设置
        this.uidFromElement = (element) => {
            let uid = element.getAttribute(window.uiaMetadata.uidKey)
            if (uid === null) {
                window.uiaMetadata.latestUid += 1
                uid = `${window.uiaDispatcher.frameBackendId}|${window.uiaMetadata.latestUid}` //fid|sequence
                element.setAttribute(window.uiaMetadata.uidKey, uid)
            }
            return uid + ':' + domUtils.getTagName(element) //fid|sequence:tagType
        }
        //根据eid获取dom element对象
        this.ElementFromUid = (uid) => {
            const tokens = uid.split(':')
            const element = document.querySelector(`${tokens[1]}[${window.uiaMetadata.uidKey}='${tokens[0]}']`) //tagType[uia-uid='fid|sequence']
            if (!element) {
                throw new UIAError(UIAERROR_CODE.NoSuchElementID, '未找到指定ID的元素')
            }
            return element
        }
        //获取子frame中父frame中的索引位置
        this.getFrameIndex = (frame) => {
            if (frame.parent === frame || frame.parent === null) {
                return -1
            } else {
                const wnds = frame.parent.frames
                for (let i = 0; i < wnds.length; i++) {
                    if (wnds[i] === frame) {
                        return i
                    }
                }
                return -1
            }
        }
        //获取节点名称
        this.getTagName = (element) => {
            // 某些情况下Form标签的tagName是input元素
            if (typeof (element.tagName) === 'string') {
                return element.tagName.toLowerCase()
            } else {
                return element.nodeName.toLowerCase()
            }
        }

        //子frame在父frame中的索引位置 -> 子frame在父frame中的DOM对象 (必须要先拿到frame的dom对象才能进行下一步的dom操作)
        this.getFrameByIndex = (index) => { //子frame的索引位置
            //1、先在父frame中找到所有的frame dom对象
            const nodes = document.querySelectorAll('frame, iframe')
            //2、找到和指定frame匹配的dom frame对象
            for (const frame of nodes) {
                if (frame.contentWindow === window.frames[index]) { //frame dom对象中的contentWindow才是frame对象
                    return frame
                }
            }
            return null
        }

        // 获取DOM对象在当前frame中的路径
        this.buildCSSPath = (element) => {
            if (element.nodeType !== 1) {
                return null
            }

            //计算元素的CSS路径
            const path = []
            do {
                const tagName = domUtils.getTagName(element)
                if (tagName === 'body' || tagName === 'html') {
                    // 防止path为空导致后续QuerySelecor报错
                    if (path.length == 0) {
                        path.unshift(tagName)
                    }
                    break
                }
                path.unshift(tagName)
                element = element.parentNode
            } while (element)

            return this.cssPathEscape(path.join('>'))
        }

        this.extractAttributes = (element) => {
            const attrDict = {}
            const names = element.getAttributeNames()
            for (const name of names) {
                let value = element.getAttribute(name)
                switch (name) {
                    case 'id':
                        attrDict['id'] = value
                        break
                    case 'title':
                        if (value.length < 50) {
                            attrDict['title'] = value
                        }
                        break
                    case 'class':
                    case 'style':
                    case window.uiaMetadata.uidKey:
                        break
                    default:
                        attrDict[name] = value
                        break
                }
            }
            if (element.classList.length > 0) {
                attrDict['class'] = [...element.classList].map(item => item.toLowerCase()).sort().join(' ')
            }

            if (element.childElementCount === 0 &&	//只有当DOM元素中没有子元素时才会取它的innerText
                !domUtils.matchElementType(element, TAGS.INPUT, TAGS.SELECT, TAGS.TEXTAREA)) {
                let text = element.innerText
                if (text && text.length > 0 && text.length < 50) {
                    attrDict['innerText'] = text
                }
            }

            if (element.parentElement) {
                attrDict['index'] = Array.prototype.indexOf.call(element.parentElement.children, element).toString()
            }
            return attrDict
        }

        this.buildSelector = (element) => {
            const path = []
            const cssPath = this.buildCSSPath(element)
            let others = document.querySelectorAll(cssPath)
            let webNode = new WebNode(element)
            do {
                const nextOthers = []
                for (const other of others) {
                    const otherWebNode = new WebNode(other)
                    if (!webNode.diff(otherWebNode)) {
                        nextOthers.push(other.parentNode)
                    }
                }
                path.unshift(webNode.toSelectorNode())
                webNode = webNode.parent()
                others = nextOthers
            } while (webNode)
            return path
        }

        //根据selector对象 -> 寻找元素 （用户录制的路径sPath可能会跨域）
        this.querySPath = (sPath, parent = null, shift = true) => {

            //判断两个属性值是否等价
            function isAttributeMatch(value, sAttr) {
                switch (sAttr.operator) {
                    case 'Equal':
                        if (sAttr.name === 'class') {
                            if (value === sAttr.value) {
                                return true
                            } else {
                                if (!value) {
                                    return false
                                }
                                //"red h1" 等价于 "h1 red"，忽略顺序
                                sValue = sAttr.value.match(/[^ ]+/g).map(item => item.toLowerCase()).sort().join(' ')
                                return value === sValue
                            }
                        } else {
                            return value === sAttr.value
                        };
                    case 'Regex': // 正则和通配符直接使用用户提供的表达式匹配
                        try {
                            return (new RegExp(sAttr.value)).test(value);
                        } catch (e) {
                            throw new ActionError(`不支持的正则表达式 : ${sAttr.value}`)
                        }
                    case 'WildCard':
                        return wildcardsMatchText(sAttr.value, value);
                    default:
                        return false
                }
            }
            // index typeIndex不支持正则和通配符
            function isIndexAttributeMatch(total, eleIndex, nodeIndex) {
                if (parseInt(nodeIndex) < 0) {
                    var a = total == Math.abs(nodeIndex) + Math.abs(eleIndex)
                    return a
                } else {
                    return nodeIndex === eleIndex
                }
            }
            //链式判断：selector.node1 -> element，selector.node2 -> element.parent，selector.node3 -> element.parent.parent
            function isElementMatchSelector(element, selector) {
                const selectorLength = selector.length
                let ele = element
                for (let i = selectorLength - 1; i >= 0; i--) {
                    const node = selector[i]
                    if (node.attributes && node.attributes.length > 0) {
                        var attrs = domUtils.extractAttributes(ele)
                        for (const sAttr of node.attributes) { //选择器一个节点中的所有属性node.attributes，sAttr
                            if (sAttr.required) {
                                if (sAttr.name === "index") {
                                    if (!isIndexAttributeMatch(ele.parentElement.children.length, attrs[sAttr.name], sAttr.value)) {
                                        return false;
                                    }
                                } else if (sAttr.name === "index-of-type") {
                                    const tagName = domUtils.getTagName(ele)
                                    const elements = Array.prototype.filter.call(ele.parentElement.children, e => domUtils.getTagName(e) === tagName);
                                    const eleIndex = Array.prototype.indexOf.call(elements, ele).toString()
                                    if (!isIndexAttributeMatch(elements.length, eleIndex, sAttr.value)) {
                                        return false;
                                    }
                                } else {
                                    // <input> type属性默认为 "text", match时"text"等效于 undefined
                                    if (domUtils.getTagName(ele) === "input" && sAttr.name === "type" && sAttr.value === "text") {
                                        if (attrs[sAttr.name] && attrs[sAttr.name] !== "text") {
                                            return false;
                                        }
                                    }
                                    // 兼容已存在非leaf节点但有 innerText属性的 selector /or/ 最后一个selector节点(非 leaf节点) 用户手动添加了 innerText的情况
                                    if (i === selectorLength - 1 && sAttr.name === "innerText" && ele.childElementCount) { 
                                        attrs["innerText"] = ele.innerText
                                    }
                                    if (!isAttributeMatch(attrs[sAttr.name], sAttr)) {
                                        return false;
                                    }
                                }
                            }
                        }
                    }
                    ele = ele.parentElement //...
                }
                return true
            }

            function wildcardsMatchText(wcValue, text) {
                function wildcardToRegex(pattern) {
                    return '^' + pattern.replace('*', '.*').replace('?', '.') + '$'
                }

                const wcRegex = wildcardToRegex(wcValue)
                return (new RegExp(wcRegex, 'im')).test(text);
            }

            //0、预处理 （如果路径跨域就返回在前一个域中的路径）
            const root = parent || document
            const sPathInFrame = []
            if (shift) {
                //如 sPath -> div>div>div>iframe>div>div>a，那么sPathInFrame -> div>div>div>iframe，shift模式下sPath -> div>div>a
                while (sPath.length > 0) {
                    const sNode = sPath.shift()
                    sPathInFrame.push(sNode)
                    if (sNode.name === 'iframe' || sNode.name === 'frame') {
                        break
                    }
                }
            } else {
                for (const sNode of sPath) {
                    sPathInFrame.push(sNode)
                    if (sNode.name === 'iframe' || sNode.name === 'frame') {
                        break
                    }
                }
            }

            //1、节点级的初步匹配
            const cssSelector = this.cssPathEscape(sPathInFrame.map(m => m.name).join('>')) // div>div>div>iframe
            const elements = root.querySelectorAll(cssSelector) //用户路径跨域的情况下，会获取到iframe这个元素，即elements[0]

            //2、属性级的详细过滤
            const matchedElements = []
            for (const element of elements) {
                if (isElementMatchSelector(element, sPathInFrame)) {
                    matchedElements.push(element)
                }
            }
            return matchedElements
        }

        //根据CSS路径字符串 -> 寻找元素
        this.queryCSSPath = (cssPath, parent = null) => {
            const root = parent || document
            const cssResult = root.querySelectorAll(cssPath) //nodelist
            return [...cssResult]
        }

        //根据XPath路径字符串 -> 寻找元素
        this.queryXPath = (xPath, parent = null) => {
            //console.log('xPath' + xPath)
            //console.log('parent' + parent)
            const root = parent || document
            var xPathResult = document.evaluate(xPath, root, null, XPathResult.ANY_TYPE, null)
            var elements = []
            while (element = xPathResult.iterateNext()) {
                elements.push(element)
            }
            return elements
        }

        this.raiseClickEvent = (clickType, element, x, y, keyModifiers) => {
            let types = []
            let button = 0
            if (clickType === CLICK_TYPE.HOVER) {
                types = ["mouseover", "mouseenter", "mousemove"]
                button = 0
            } else if (clickType === CLICK_TYPE.DOUBLE_CLICK) {
                types = ["mousedown", "mouseup", "click", "mousedown", "mouseup", "click", "dblclick"]
                button = 0
            } else if (clickType === CLICK_TYPE.RIGHT_CLICK) {
                types = ["mousedown", "mouseup", "contextmenu"]
                button = 2
            } else if (clickType === CLICK_TYPE.MIDDLE_CLICK) {
                types = ["mousedown", "mouseup", "click"]
                button = 1
            } else {
                types = ["mousedown", "mouseup", "click"]
                button = 0
            }
            const ctrlKey = !!(keyModifiers & KEY_MODIFIERS.CTRL)
            const altKey = !!(keyModifiers & KEY_MODIFIERS.ALT)
            const shiftKey = !!(keyModifiers & KEY_MODIFIERS.SHIFT)
            let waitTime = 0 //延时执行，保证event生效  尝试了时间递增1不可以
            for (const type of types) {
                waitTime += 50
                setTimeout(() => {
                    var evt = document.createEvent("MouseEvents")
                    evt.initMouseEvent(type, true, true, window, 1, 0, 0, x, y, ctrlKey, altKey, shiftKey, false, button, null)
                    element.dispatchEvent(evt)
                }, waitTime)
            }
        }

        this.raiseClickOnElement = (element) => {
            const rect = element.getBoundingClientRect()
            domUtils.raiseClickEvent(CLICK_TYPE.CLICK, element, rect.x + rect.width / 2, rect.y + rect.height / 2, KEY_MODIFIERS.NONE)
        }

        this.toString = (any) => {
            return (any === null || any === undefined) ? null : any.toString()
        }

        this.matchText = (matchMode, matchValue, text) => {
            if (matchMode === MATCH_MODE.EXACT) {
                return matchValue === text
            } else if (matchMode === MATCH_MODE.FUZZY) {
                return text && text.indexOf(matchValue) > -1
            } else { // MATCH_MODE.REGEX
                return (new RegExp(matchValue)).test(text)
            }
        }

        this.getFrameOffset = (element) => {
            const pLeft = parseInt(window.getComputedStyle(element, null).getPropertyValue('padding-left')) || 0
            const pTop = parseInt(window.getComputedStyle(element, null).getPropertyValue('padding-top')) || 0
            const bLeft = parseInt(window.getComputedStyle(element, null).getPropertyValue('border-left-width')) || 0
            const bTop = parseInt(window.getComputedStyle(element, null).getPropertyValue('border-top-width')) || 0
            return {
                x: pLeft + bLeft,
                y: pTop + bTop
            }
        }

        this.pointLikeScale = (pointLike, zoom) => {
            return {
                x: pointLike.x / zoom,
                y: pointLike.y / zoom
            }
        }

        this.cssPathEscape = (value) => {
            if (!value) {
                return null
            }
            var cssStr = String(value);
            var length = cssStr.length;
            var index = -1;
            var codeUnit;
            var result = '';

            var firstCodeUnit = cssStr.charCodeAt(0);
            while (++index < length) {
                codeUnit = cssStr.charCodeAt(index);

                //类型 1.图形一类的特殊字符
                if (codeUnit < 0x20 || codeUnit > 0x7E) {
                    if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF && index < length) {
                        // It’s a high surrogate, and there is a next character.
                        var extra = cssStr.charCodeAt(index++);
                        if ((extra & 0xFC00) == 0xDC00) {
                            // next character is low surrogate
                            codeUnit = ((codeUnit & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000;
                        } else {
                            // It’s an unmatched surrogate; only append this code unit, in case
                            // the next code unit is the high surrogate of a surrogate pair.
                            index--;
                        }
                    }
                    result += '\\' + codeUnit.toString(16).toUpperCase() + ' ';
                    continue;
                } else {
                    // 类型 2.如果为 NULL (U+0000),使用(U+FFFD)替换
                    if (codeUnit == 0x0000) {
                        result += '\uFFFD';
                        continue;
                    }

                    // 类型 3.使用unicode
                    // [1-1F] (U+0001 to U+001F) 
                    // U+007F, 0x003A […]
                    // 第一项为 [0-9] (U+0030 to U+0039), […]
                    // 第二项为 [0-9] (U+0030 to U+0039) 且第一项是 `-` (U+002D), […]
                    if ((codeUnit >= 0x0001 && codeUnit <= 0x001F) ||
                        codeUnit == 0x007F || codeUnit == 0x003A ||
                        (index == 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
                        (index == 1 && codeUnit >= 0x0030 && codeUnit <= 0x0039 && firstCodeUnit == 0x002D)) {
                        result += '\\' + codeUnit.toString(16) + ' ';
                        continue;
                    }

                    // 类型 4.使用`\`转义
                    // 只有一项,且为 `-` (U+002D), […]
                    if (index == 0 && length == 1 && codeUnit == 0x002D) {
                        result += '\\' + cssStr.charAt(index);
                        continue;
                    }

                    // 类型 5.使用字符本身 不需要特殊处理
                    //  `-` (U+002D) 或 `>` (0x003E) 或 `_` (U+005F),
                    // is in one of the ranges [0-9] (U+0030 to U+0039)
                    //[A-Z] (U+0041 to U+005A)
                    //[a-z] (U+0061 to U+007A), […]
                    if (codeUnit == 0x002D || codeUnit == 0x003E || codeUnit == 0x005F ||
                        codeUnit >= 0x0030 && codeUnit <= 0x0039 ||
                        codeUnit >= 0x0041 && codeUnit <= 0x005A ||
                        codeUnit >= 0x0061 && codeUnit <= 0x007A) {
                        result += cssStr.charAt(index);
                        continue;
                    }

                    // 否则 没有检测到的字符  直接转义
                    result += '\\' + cssStr.charAt(index);
                }
            }
            return result;
        }

        this.replaceNbspToSpace = (value) => {
            if(value){
                value = value.replace(NBSP_REGEXP, String.fromCharCode(32))
            }
            return value
        }

        // 获取当前元素有滚动条的父节点，到document为止，如果
        this.getScrollableParent = (element, direction) => {
            var ret = element;
            if(direction == "vertical"){
                while (ret) {
                    if (ret.scrollHeight <= ret.clientHeight) {
                        ret = ret.parentElement;
                    } else {
                        break;
                    }
                }
            }
            else if(direction == "horizontal"){
                while (ret) {
                    if (ret.scrollWidth <= ret.clientWidth) {
                        ret = ret.parentElement;
                    } else {
                        break;
                    }
                }
            }

            if (!ret)
               ret = element;
            return ret;
        }
    }

    class Bubbling {
        constructor(args) {
            this.args = args
        }
    }

    class Tunneling {
        constructor(frame, args) {
            this.args = args
            this.frameIndex = domUtils.getFrameIndex(frame.contentWindow)
        }
    }

    class ActionError extends Error {
        constructor(message) {
            super(message || "")
        }
    }

    class UIAError extends Error {
        constructor(code, message) {
            super(message || "")
            this.code = code
        }
    }

    class Rect {
        constructor(x, y, width, height) {
            this.x = x
            this.y = y
            this.width = width
            this.height = height
        }

        contains(point) {
            return point.x >= this.x && point.x <= (this.width + this.x) && point.y >= this.y && point.y <= (this.height + this.y)
        }

        center() {
            return {
                x: Math.round(this.x + this.width / 2),
                y: Math.round(this.y + this.height / 2)
            }
        }

        offset(x, y) {
            this.x += x
            this.y += y
        }

        scale(ratio) {
            return new Rect(Math.round(this.x * ratio), Math.round(this.y * ratio),
                Math.round(this.width * ratio), Math.round(this.height * ratio))
        }

        ScaleInv(ratio) {
            return new Rect(Math.round(this.x / ratio), Math.round(this.y / ratio),
                Math.round(this.width / ratio), Math.round(this.height / ratio))
        }

        intersect(rect) {
            const x1 = Math.max(this.x, rect.x)
            const x2 = Math.min(this.x + this.width, rect.x + rect.width)
            const y1 = Math.max(this.y, rect.y)
            const y2 = Math.min(this.y + this.height, rect.y + rect.height)
            if (x2 >= x1 && y2 >= y1) {
                return new Rect(x1, y1, x2 - x1, y2 - y1)
            } else {
                return null
            }
        }

        static fromDOMRect(domRect) {
            return new Rect(Math.round(domRect.x), Math.round(domRect.y),
                Math.round(domRect.width), Math.round(domRect.height))
        }
    }

    class WebNode {
        constructor(element) {
            this.element = element
            this.classList = [...element.classList]
            this.attributes = domUtils.extractAttributes(element)
            this.required = new Set()
            // 为了防止出现运行时经常匹配到多个的问题，这里多加入一些属性，尽量严格一点
            if (domUtils.matchElementType(element, TAGS.INPUT, TAGS.BUTTON, TAGS.SELECT)) {
                if (this.attributes['type']) {
                    this.required.add('type')
                }
                if (this.attributes['name']) {
                    this.required.add('name')
                }
            }
            // 在diff的时候再判断是否required
            // if (this.attributes['id'] && !(/\d+/.test(this.attributes['id']))) {
            //     this.required.add('id')
            // }
        }

        attr(name) {
            return this.attributes[name] || null
        }

        parent() {
            const parent = this.element.parentElement
            if (parent == null) { // 有可能录制的HTML节点
                return null
            }
            const tagName = domUtils.getTagName(parent)
            if (tagName === 'body' || tagName === 'html') {
                return null
            } else {
                return new WebNode(parent)
            }
        }

        diff(other) {
            if (this.element === other.element) {
                return true
            }
            const names = ['type', 'id', 'name', 'title', 'innerText', 'class', 'index']
            for (const name of names) {
                if (name === 'id' && /\d+/.test(this.attr(name))) {
                    continue
                }
                if (name === 'class') {
                    if (this.classList.length > 0) {
                        let classes = this.classList.filter(m => other.classList.indexOf(m) == -1);
                        if (classes.length > 0 && this.classList.some(m => !other.classList.includes(m)) && !/hover|[^a-zA-Z](?:on|open|active)/.test(classes.join(' '))) {
                            this.required.add(name)
                            return true
                        }
                    }
                } else {
                    if (this.attr(name) !== null && this.attr(name) !== other.attr(name)) {
                        this.required.add(name)
                        return true
                    }
                }
            }
            return false
        }

        toSelectorNode() {
            const node = {
                'name': domUtils.getTagName(this.element),
                'type': 'Web',
                'attributes': []
            }
            for (const [name, value] of Object.entries(this.attributes)) {
                node.attributes.push({
                    'name': name,
                    'value': value,
                    'operator': 'Equal',
                    'required': this.required.has(name)
                })
            }
            return node
        }
    }

    window.uiaDispatcher = new function () {
        const actions = {
            getFrameIndex: (args) => {
                return domUtils.getFrameIndex(window)
            },
            elementFromPoint: (args) => {
                const element = document.elementFromPoint(args.x, args.y)
                if (element) {
                    if (domUtils.matchElementType(element, TAGS.IFRAME, TAGS.FRAME)) {
                        const offset = domUtils.getFrameOffset(element)
                        const bounding = Rect.fromDOMRect(element.getBoundingClientRect())
                        return new Tunneling(element, {
                            x: args.x - bounding.x - offset.x,
                            y: args.y - bounding.y - offset.y
                        })
                    } else {
                        return domUtils.uidFromElement(element)
                    }
                } else {
                    return null
                }
            },
            inspectByPoint: (args) => {
                if (!args.clientX)
                    args.clientX = 0
                if (!args.clientY)
                    args.clientY = 0
                if (!args.zoom) //内置浏览器是没有这个概念的 所以没有传zoom值
                    args.zoom = 1

                const element = document.elementFromPoint(args.x, args.y)
                if (element) {
                    const cssBounding = Rect.fromDOMRect(element.getBoundingClientRect())
                    if (domUtils.matchElementType(element, TAGS.IFRAME, TAGS.FRAME)) {
                        const offset = domUtils.pointLikeScale(domUtils.getFrameOffset(element), args.zoom)
                        return new Tunneling(element, {
                            //(x,y)->鼠标在subframe中的坐标
                            x: args.x - cssBounding.x - offset.x,
                            y: args.y - cssBounding.y - offset.y,
                            //(clientX,clientY)->鼠标在topfram中的坐标，越深值越大
                            clientX: args.clientX + cssBounding.x + offset.x,
                            clientY: args.clientY + cssBounding.y + offset.y,
                            zoom: args.zoom
                        })
                    } else {
                        if (args.clientX > 0 || args.clientY > 0) {
                            cssBounding.offset(args.clientX, args.clientY)
                        }
                        // 结果与InspectResult结构保持一致
                        const tagName = domUtils.getTagName(element).toUpperCase()
                        const finalBounding = cssBounding.scale(args.zoom)
                        return {
                            bounding: finalBounding,
                            info: ['INPUT', 'BUTTON'].includes(tagName) ?
                                tagName + ',' + element.getAttribute('type') : tagName
                        }
                    }
                } else {
                    return null
                }
            },
            selectorFromPoint: (args) => {
                const element = document.elementFromPoint(args.x, args.y)
                if (element) {
                    const sPath = domUtils.buildSelector(element)
                    if (domUtils.matchElementType(element, TAGS.IFRAME, TAGS.FRAME)) {
                        const bounding = Rect.fromDOMRect(element.getBoundingClientRect())
                        const offset = domUtils.getFrameOffset(element)
                        return new Tunneling(element, {
                            //(x,y)->鼠标在subframe中的坐标
                            x: args.x - bounding.x - offset.x,
                            y: args.y - bounding.y - offset.y,
                            sPath: args.sPath ? args.sPath.concat(sPath) : sPath
                        })
                    } else {
                        return args.sPath ? args.sPath.concat(sPath) : sPath
                    }
                } else {
                    return null
                }
            },
            //获取元素的全局路径(从mainframe开始)
            pathFromMainFrameByElementId: (args) => {

                var sPath = args.sPath || []

                if (args.childFrameIndex !== undefined) { // request from child frame
                    const domFrame = domUtils.getFrameByIndex(args.childFrameIndex) //在父frame中的索引位置 -> 在父frame中的DOM对象
                    var frameSPath = domUtils.buildCSSPath(domFrame)
                    if (!frameSPath)
                        throw new ActionError('计算元素的全局路径时出错')
                    sPath = frameSPath.split(">").concat(sPath)
                } else { // first request
                    const element = domUtils.ElementFromUid(args.elementId)
                    var elementSPath = domUtils.buildCSSPath(element)
                    if (!elementSPath)
                        throw new ActionError('计算元素的全局路径时出错')
                    sPath = elementSPath.split(">").concat(sPath)
                }

                const frameIndex = domUtils.getFrameIndex(window)
                if (frameIndex === -1) { // top main frame
                    return sPath
                } else {
                    return new Bubbling({
                        elementId: args.elementId,
                        sPath: sPath,
                        childFrameIndex: frameIndex
                    })
                }
            },

            querySelectorAll: (args) => {
                //1、预处理
                const sPath = args.path
                let parentElement = null
                if (args.elementId) {
                    parentElement = domUtils.ElementFromUid(args.elementId)
                }

                //2、获取DOM对象列表
                var elements = domUtils.querySPath(sPath, parentElement)

                //3、同时处理用户录制的路径出现的（一般情况和跨域情况），跨域情况一般是指用户路径中包含iframe和frame元素
                //3.1 用户路径跨域的情况下，elements只会包含一个iframe元素对象，elements[0]
                if (elements.length === 1 &&
                    domUtils.matchElementType(elements[0], TAGS.IFRAME, TAGS.FRAME) &&
                    sPath.length > 0) {
                    return new Tunneling(elements[0], { //返回iframe对象及其路径，用于之后找到iframe在整个标签页browser中的索引位置
                        path: sPath //以shift模式调用querySPath时会修改sPath，此时sPath为在后一个域中的路径，如div>div>iframe>div>a，此时返回的sPath为div>a
                    })
                }
                //3.2 非跨域的情况下，直接返回普通元素对象的id即可
                else {
                    return elements.map(m => domUtils.uidFromElement(m))
                }
            },
            queryCSSSelectorAll: (args) => {
                //1、预处理
                const cssPath = args.path
                let parentElement = null
                if (args.elementId) {
                    parentElement = domUtils.ElementFromUid(args.elementId)
                }

                //2、获取DOM对象列表
                var elements = domUtils.queryCSSPath(cssPath, parentElement)

                //3、如果直接给一个跨域的CSS路径的话，不支持，目前仅模拟JS DOM操作的模式，忽略路径跨域的情况
                /*
                if (elements.length === 1 &&
                    domUtils.matchElementType(elements[0], TAGS.IFRAME, TAGS.FRAME) &&
                    sPath.length > 0) {
                    return new Tunneling(elements[0], {
                        path: cssPath
                    })
                } else {
                    return elements.map(m => domUtils.uidFromElement(m))
                }*/

                return elements.map(m => domUtils.uidFromElement(m))
            },
            queryXPathSelectorAll: (args) => {
                //1、预处理
                const xPath = args.path
                let parentElement = null
                if (args.elementId) {
                    parentElement = domUtils.ElementFromUid(args.elementId)
                }

                //2、获取DOM对象列表
                var elements = domUtils.queryXPath(xPath, parentElement)

                //3、如果直接给一个跨域的XPath路径的话，不支持，目前仅模拟JS DOM操作的模式，忽略路径跨域的情况
                /*
                if (elements.length === 1 &&
                    domUtils.matchElementType(elements[0], TAGS.IFRAME, TAGS.FRAME) &&
                    sPath.length > 0) {
                    return new Tunneling(elements[0], {
                        path: xPath
                    })
                } else {
                    return elements.map(m => domUtils.uidFromElement(m))
                }*/

                return elements.map(m => domUtils.uidFromElement(m))
            },
            //此方法似乎没用到
            querySelector: (args) => {
                const sPath = args.path
                const elements = domUtils.querySPath(sPath)
                if (elements.length === 0) {
                    throw new ActionError('找不到匹配的元素')
                } else if (elements.length > 1) {
                    throw new ActionError('匹配到多个元素, 无法识别唯一属性')
                } else {
                    if (domUtils.matchElementType(elements[0], TAGS.IFRAME, TAGS.FRAME) &&
                        sPath.length > 0) {
                        return new Tunneling(elements[0], {
                            path: sPath
                        })
                    } else {
                        return elements.map(m => domUtils.uidFromElement(m))
                    }
                }
            },
            queryTableSelector: (args) => {
                function getAttrValue(element, attrName, pattern) {
                    let result = null
                    if (attrName === 'Text') {
                        result = domUtils.replaceNbspToSpace(element.innerText || element.value || "")
                    } else if (attrName.includes('Href')) {
                        const eleA = domUtils.findAncestor(element, (e) => {
                            return domUtils.matchElementType(e, TAGS.A)
                        }, true)
                        if (eleA) {
                            result = attrName.includes('AbsoluteUrl') ? eleA.href : eleA.getAttribute('href')
                        } else {
                            result = null
                        }
                    } else if (attrName.includes('Image')) {
                        if (domUtils.matchElementType(element, TAGS.IMG)) {
                            result = attrName.includes('AbsoluteUrl') ? element.src : element.getAttribute('src')
                        } else {
                            result = null
                        }
                    } else {
                        result = null
                    }

                    if (pattern) {
                        const regex = new RegExp(pattern)
                        const arr = regex.exec(result)
                        if (arr) {
                            if (arr.length == 1) {
                                return arr[0] //整个匹配文本
                            } else {
                                return arr[1] //第1个子表达式相匹配的文本
                            }
                        } else {
                            return null
                        }
                    } else {
                        return result
                    }
                }

                //将列的查询结果限制在当前行中
                function parentFromAnchor(anchor, generation) {
                    let parent = anchor
                    for (let i = 0; i < generation; i++) {
                        parent = parent.parentElement
                    }
                    return parent
                }

                if (args.base && args.base.length > 0) {
                    if (args.anchor === undefined) {
                        args.anchor = args.base.concat(args.columns[0].path)
                    }
                    const anchorElements = domUtils.querySPath(args.anchor)
                    if (anchorElements.length === 1 &&
                        domUtils.matchElementType(anchorElements[0], TAGS.IFRAME, TAGS.FRAME) &&
                        args.anchor.length > 0) {
                        return new Tunneling(anchorElements[0], args)
                    } else {
                        const table = []
                        const generation = args.columns[0].path.length //限制列的查询结果
                        //以第一列查询到的数据为锚点，按行查数据
                        let rowIdx = 0 // 当前构建的table 行号
                        for (const anchorElement of anchorElements) {
                            const parent = parentFromAnchor(anchorElement, generation)
                            const row = []

                            let columnIdx = 0
                            for (const column of args.columns) {
                                const leafNodes = columnIdx == 0 ? anchorElements : domUtils.querySPath(column.path, parent, false)
                                const leafCount = leafNodes.length
                                // 在当前 column中找到唯一元素，获取第一项
                                // 在当前 column中找到多个相似元素且个数大于当前行号时，取行号对应的元素
                                // 否则未找到 取值 undefined
                                const leafNode = leafCount == 1 ? leafNodes[0]
                                    : leafCount >= rowIdx + 1 ? leafNodes[rowIdx] : undefined
                                if (leafNode !== undefined) {
                                    row.push(getAttrValue(leafNode, column.attr, column.pattern))
                                } else {
                                    row.push(null)
                                }
                                columnIdx += 1
                            }
                            rowIdx += 1
                            table.push(row)
                        }
                        return table
                    }
                } else {
                    // 没有parent，说明只有一列
                    const sPath = args.columns[0].path
                    const elements = domUtils.querySPath(sPath)
                    if (elements.length === 1 &&
                        domUtils.matchElementType(elements[0], TAGS.IFRAME, TAGS.FRAME) &&
                        sPath.length > 0) {
                        return new Tunneling(elements[0], args)
                    } else {
                        const attr = args.columns[0].attr
                        const pattern = args.columns[0].pattern
                        return elements.map(m => [getAttrValue(m, attr, pattern)])
                    }
                }
            },
            click: (args) => {
                const element = domUtils.ElementFromUid(args.elementId)
                const rect = element.getBoundingClientRect()
                let clickType = CLICK_TYPE.CLICK
                if (args.button === 1) {
                    clickType = CLICK_TYPE.RIGHT_CLICK
                } else if (args.button === 2) {
                    clickType = CLICK_TYPE.MIDDLE_CLICK
                }
                domUtils.raiseClickEvent(clickType, element, rect.x + rect.width / 2, rect.y + rect.height / 2, args.keys) //在元素的中心点击
            },
            dblClick: (args) => {
                const element = domUtils.ElementFromUid(args.elementId)
                const rect = element.getBoundingClientRect()
                const clickType = CLICK_TYPE.DOUBLE_CLICK
                domUtils.raiseClickEvent(clickType, element, rect.x + rect.width / 2, rect.y + rect.height / 2, KEY_MODIFIERS.NONE)
            },
            input: (args) => {
                // 需要重构成 SendKeysToHtmlElement
                const element = domUtils.ElementFromUid(args.elementId)
                const nodeName = element.nodeName.toLowerCase()
                if (nodeName == 'textarea' || nodeName == 'input') {
                    if (args.append) {
                        element.value = element.value + args.value
                    } else {
                        element.value = args.value
                    }
                } else {
                    if (args.append) {
                        element.innerText = element.innerText + args.value
                    } else {
                        element.innerText = args.value
                    }
                }
            },
            hover: (args) => {
                const element = domUtils.ElementFromUid(args.elementId)
                const rect = element.getBoundingClientRect()
                const clickType = CLICK_TYPE.HOVER
                domUtils.raiseClickEvent(clickType, element, rect.x + rect.width / 2, rect.y + rect.height / 2, KEY_MODIFIERS.NONE)
            },
            focus: (args) => {
                const element = domUtils.ElementFromUid(args.elementId)
                element.focus()
            },
            scrollIntoViewIfNeeded: (args) => {
                const element = domUtils.ElementFromUid(args.elementId)
                const smoothScrollContainer = domUtils.getSmoothScrollContainer(element)
                if (smoothScrollContainer) {
                    domUtils.updateContainerScrollBehavior(smoothScrollContainer, SCROLL_BEHAVIOR.AUTO)
                    element.scrollIntoViewIfNeeded() //默认参数为True，让元素在可视区域中居中对齐
                    domUtils.updateContainerScrollBehavior(smoothScrollContainer, SCROLL_BEHAVIOR.SMOOTH)
                } else {
                    element.scrollIntoViewIfNeeded()
                }
            },

            getViewPortRect: () => {
                return new Rect(0, 0, window.innerWidth, window.innerHeight)
            },

            getBounding: (args) => {
                const rects = args.rects || []
                if (args.childFrameIndex !== undefined) { // request from child frame
                    const frame = domUtils.getFrameByIndex(args.childFrameIndex)
                    const offset = domUtils.getFrameOffset(frame)
                    const bounding = frame.getBoundingClientRect()
                    const rect = new Rect(offset.x + bounding.x, offset.y + bounding.y, bounding.width, bounding.height)
                    rects.push(rect)
                } else { // first request
                    const element = domUtils.ElementFromUid(args.elementId)
                    // 需要考虑到element的父元素可能hidden属性，这里只能返回可视区域（取交集）
                    let elementBounding = element.getBoundingClientRect()
                    const targetParent = domUtils.findAncestor(element, (e) => {
                        return getComputedStyle(e).overflow === 'hidden'
                    }, false)
                    if (targetParent) {
                        let parentBounding = Rect.fromDOMRect(targetParent.getBoundingClientRect())
                        /* 在某种情况下祖先元素会先遇到position=fixed再遇到overflow=hidden，这种则不需要取交集，因为已经不受overflow影响了
                         * 但是目前又无法知道是否有情况会导致与此场景一样的效果，这里先暴力一点如果没有交集（intersectBounding==null）则直接返回原始矩形
                         */
                        intersectBounding = parentBounding.intersect(elementBounding)
                        if (intersectBounding) {
                            elementBounding = intersectBounding
                        }
                    }
                    rects.push(Rect.fromDOMRect(elementBounding))
                }
                const frameIndex = domUtils.getFrameIndex(window)
                if (frameIndex === -1) { // top frame
                    // return rects.reduce((acc, cur) => {
                    //     return new Rect(acc.x + cur.x,
                    //         acc.y + cur.y,
                    //         acc.width,
                    //         acc.height)
                    // })
                    let rectResult = new Rect(rects[0].x, rects[0].y, rects[0].width, rects[0].height);
                    for (let i = 1; i < rects.length; i++) {
                        rectResult.offset(rects[i].x, rects[i].y)
                    }
                    return rectResult
                } else {
                    return new Bubbling({
                        elementId: args.elementId,
                        rects: rects,
                        childFrameIndex: frameIndex
                    })
                }
            },
            isEditable: (args) => {
                const element = domUtils.ElementFromUid(args.elementId)
                const nodeName = element.nodeName.toLowerCase()
                if (element.nodeType == 1 && (
                    nodeName == "textarea" ||
                    (nodeName == "input" && /^(?:text|email|number|search|tel|url|password)$/i.test(element.type)) ||
                    element.isContentEditable)) {
                    return element.disabled !== true && element.readOnly !== true
                } else {
                    return false
                }
            },
            getAllAttributes: (args) => {
                const element = domUtils.ElementFromUid(args.elementId)
                const names = element.getAttributeNames()
                const attrs = []
                for (const name of names) {
                    if (name === window.uiaMetadata.uidKey) {
                        continue
                    }
                    attrs.push({
                        name: name,
                        value: element.getAttribute(name)
                    })
                }
                return attrs
            },
            getAttribute: (args) => {
                const element = domUtils.ElementFromUid(args.elementId)
                let attrName = args.name.toLowerCase()
                if (attrName === "checked") {
                    return element.checked
                }
                if (attrName === "readonly") {
                    return element.readOnly;
                }
                if (attrName === "disabled") {
                    return element.disabled;
                }
                // 用户指定获取全路径
                if(attrName === "absoluteurl"){
                    return element.href || element.src;
                }
                return element.getAttribute(args.name)
            },
            setAttribute: (args) => {
                const element = domUtils.ElementFromUid(args.elementId)
                element.setAttribute(args.name, args.value)
            },
            getValue: (args) => {
                const element = domUtils.ElementFromUid(args.elementId)
                return domUtils.toString(element.value)
            },
            setValue: (args) => {
                const element = domUtils.ElementFromUid(args.elementId)
                element.value = args.value
            },
            getText: (args) => {
                const element = domUtils.ElementFromUid(args.elementId)
                return domUtils.toString(element.innerText || element.value || "")
            },
            getHtml: (args) => {
                const element = domUtils.ElementFromUid(args.elementId)
                return domUtils.toString(element.outerHTML)
            },
            getTable: (args) => {
                const element = domUtils.ElementFromUid(args.elementId)
                const table = domUtils.findAncestor(element, (e) => {
                    return domUtils.matchElementType(e, TAGS.TABLE)
                })
                if (table) {
                    // 过滤掉表格中的无效行<tr></tr>
                    return [...table.rows].filter(row => row.children.length > 0).map(t => [...t.children].map(u => domUtils.replaceNbspToSpace(u.innerText || "")))
                } else {
                    return null
                }
            },
            getBaseTableValue: (args) => {
                const tableElement = domUtils.ElementFromUid(args.elementId)
                const table = []
                const rows = tableElement.rows
                const rowsLength = rows.length
                // 初始化行
                for (let r = 0; r < rowsLength; ++r) {
                    table[r] = []
                }

                // 数据填充
                for (let rIdx = 0; rIdx < rowsLength; ++rIdx) {
                    let cells = rows[rIdx].cells
                    let cIdx = 0
                    for (let c = 0, cellsLength = cells.length; c < cellsLength; ++c) {
                        while (table[rIdx][cIdx] || table[rIdx][cIdx] === "") {
                            ++cIdx
                        }

                        let cell = cells[c]
                        let xSpan = cIdx + (cell.colSpan || 1)
                        let ySpan = rIdx + (cell.rowSpan || 1)
                        for (let curRIdx = rIdx; curRIdx < ySpan; ++curRIdx) {
                            for (let curCIdx = cIdx; curCIdx < xSpan; ++curCIdx) {
                                table[curRIdx][curCIdx] =  domUtils.replaceNbspToSpace(cell.innerText || cell.outerText || "")
                            }
                        }
                        x = xSpan
                    }
                }

                // 表格对齐
                const rowLengths = table.map(c => c.length)
                const maxColCount = Math.max(...rowLengths)
                if (rowLengths.some(lgth => lgth < maxColCount)) {
                    for (let rIdx = 0; rIdx < rowLengths.length; ++rIdx) {
                        if (rowLengths[rIdx] < maxColCount) {
                            table[rIdx] = table[rIdx].concat([...Array(maxColCount - rowLengths[rIdx])].map(_ => ""))
                        }
                    }
                }
                return table
            },
            parent: (args) => {
                const element = domUtils.ElementFromUid(args.elementId)

                if (element.parentElement == null)
                    return null
                else
                    return domUtils.uidFromElement(element.parentElement)
            },
            children: (args) => {
                const element = domUtils.ElementFromUid(args.elementId)
                return [...element.children].map(m => domUtils.uidFromElement(m))
            },
            nextSibling: (args) => {
                const element = domUtils.ElementFromUid(args.elementId)

                if (element.nextElementSibling == null)
                    return null
                else
                    return domUtils.uidFromElement(element.nextElementSibling)
            },
            tableParentSelectorInFrame: (args) => {
                const element = domUtils.ElementFromUid(args.elementId)

                const tableElement = domUtils.findAncestor(element, (e) => {
                    return domUtils.matchElementType(e, TAGS.TABLE)
                }, true)

                if (tableElement) {
                    const sPath = domUtils.buildSelector(tableElement)
                    return args.sPath ? args.sPath.concat(sPath) : sPath
                } else {
                    return null
                }
            },
            select: (args) => {
                // items, mode, append, multiple
                const element = domUtils.ElementFromUid(args.elementId)
                if (!domUtils.matchElementType(element, TAGS.SELECT)) {
                    throw new ActionError('此元素不支持勾选操作')
                }

                function isMatch(text) {
                    if (args.mode === MATCH_MODE.EXACT) {
                        return args.items.indexOf(text) > -1
                    } else if (args.mode === MATCH_MODE.FUZZY) {
                        return args.items.some((m) => {
                            return text && text.indexOf(m) > -1
                        })
                    } else { // MATCH_MODE.REGEX
                        return args.items.some((m) => {
                            return (new RegExp(m)).test(text)
                        })
                    }
                }

                if (args.multiple && !args.append) {
                    for (const option of element.options) {
                        option.selected = false
                    }
                }

                for (const option of element.options) {
                    if (isMatch(option.text)) {
                        option.selected = true
                        if (!args.multiple) {
                            break
                        }
                    }
                }

                const event = document.createEvent('Events');
                event.initEvent('change', true, false);
                element.dispatchEvent(event);
            },
            selectByIndex: (args) => {
                // indexes, append, multiple 
                const element = domUtils.ElementFromUid(args.elementId)
                if (!domUtils.matchElementType(element, TAGS.SELECT)) {
                    throw new ActionError('此元素不支持勾选操作')
                }

                if (args.multiple && !args.append) {
                    for (const option of element.options) {
                        option.selected = false
                    }
                }

                for (const option of element.options) {
                    if (args.indexes.indexOf(option.index) > -1) {
                        option.selected = true
                        if (!args.multiple) {
                            break
                        }
                    }
                }

                const event = document.createEvent('Events');
                event.initEvent('change', true, false);
                element.dispatchEvent(event);
            },
            getSelectOptions: (args) => {
                let element = domUtils.ElementFromUid(args.elementId)
                if (!domUtils.matchElementType(element, TAGS.SELECT)) {
                    throw new ActionError('此元素不支持勾选操作')
                }
                return [...element.options].map((m) => {
                    return {
                        name: m.text,
                        value: m.value,
                        selected: m.selected
                    }
                })
            },
            check: (args) => {
                let element = domUtils.ElementFromUid(args.elementId)
                // label -> input
                if (domUtils.matchElementType(element, TAGS.LABEL)) {
                    var forId = element.htmlFor;
                    if (forId != null && forId.length !== 0) {
                        var targetElement = element.ownerDocument.getElementById(forID);
                        if (targetElement != null) {
                            element = targetElement;
                        }
                    }
                }
                if (!domUtils.matchElementType(element, TAGS.INPUT)) {
                    throw new ActionError('此元素不支持勾选操作')
                }
                if (element.type === 'radio') {
                    if (args.mode !== CHECK_MODE.CHECK) {
                        throw new ActionError('radio元素不支持取消勾选操作')
                    } else {
                        element.checked || domUtils.raiseClickOnElement(element)
                    }
                } else if (element.type === 'checkbox') {
                    if (args.mode === CHECK_MODE.CHECK) {
                        !element.checked && domUtils.raiseClickOnElement(element)
                    } else if (args.mode === CHECK_MODE.UNCHECK) {
                        element.checked && domUtils.raiseClickOnElement(element)
                    } else {
                        domUtils.raiseClickOnElement(element) // CHECK_MODE.TOGGLE
                    }
                } else {
                    throw new ActionError('此元素不支持勾选操作')
                }
            },
            isChecked: (args) => {
                let element = domUtils.ElementFromUid(args.elementId)
                // label -> input
                if (domUtils.matchElementType(element, TAGS.LABEL)) {
                    var forId = element.htmlFor;
                    if (forId != null && forId.length !== 0) {
                        var targetElement = element.ownerDocument.getElementById(forID);
                        if (targetElement != null) {
                            element = targetElement;
                        }
                    }
                }
                const status = element.checked
                if (typeof status === "boolean") {
                    return status
                } else {
                    throw new ActionError('无法读取此元素的勾选状态')
                }
            },
            isEnabled: (args) => {
                const element = domUtils.ElementFromUid(args.elementId)
                const status = element.disabled
                if (typeof status === "boolean") {
                    return status
                } else {
                    return true
                }
            },
            isDisplayed: (args) => {
                let element = domUtils.ElementFromUid(args.elementId)
                //元素隐藏暂时不考虑opacity的情况
                let visibility = getComputedStyle(element).visibility; //计算样式visibility只有visible和hidden两种情况
                if (visibility == 'visible') //需要进一步观察，看它是不是在一个不可见的容器中
                {
                    while (element && element.nodeType == 1) {
                        let display = getComputedStyle(element).display;
                        //console.log('display' + display)	
                        if (display == '' || display == 'none')
                            return false;
                        element = element.parentNode;
                    }
                    return true
                } else {
                    return false; //不管容器可不可见，如果自身是不可见的就不可见
                }
            },
            executeJavaScript: (args) => {
                // elementId有可能为空
                let element = null
                if (args.elementId) {
                    element = domUtils.ElementFromUid(args.elementId)
                }
                return window._uia_temp_function(element, args.argument)
            },
            scrollTo: (args) => {
                // elementId有可能为空
                // location (ScrollLocation)
                
                let element = null
                if (args.elementId) {
                    element = domUtils.ElementFromUid(args.elementId)
                } else {
                    element = window
                }
                if (args.searchUp){
                    // 滚动元素只有纵向滚动
                    element = domUtils.getScrollableParent(element, "vertical");
                }

                if (args.location == 'Point') {
                    element.scrollTo({
                        top: args.top,
                        left: args.left,
                        behavior: args.behavior
                    })
                } else if (args.location == 'Top') {
                    element.scrollTo({
                        top: 0,
                        behavior: args.behavior
                    })
                } else if (args.location == 'Bottom') {
                    element.scrollTo({
                        top: element == window ? document.body.scrollHeight : element.scrollHeight,
                        behavior: args.behavior
                    })
                } else if (args.location == 'Screen') {
                    element.scrollTo({
                        top: document.documentElement.scrollTop + document.documentElement.clientHeight,
                        behavior: args.behavior
                    })
                } else { }
            },
            dragTo: (args) => {

                //1、获取element对象
                const element = domUtils.ElementFromUid(args.elementId);
                //2、定义事件触发顺序
                let evt = document.createEvent("MouseEvents");
                //3、触发拖拽事件
                //3.1 mouse over dragged element and mousedown
                let begin_types = ["mousemove", "mouseenter", "mouseover", "mousedown", "dragstart", "drag"];
                for (const type of begin_types) {
                    let rect = element.getBoundingClientRect();
                    evt.initMouseEvent(type, true, true, window, 1, 0, 0, rect.left + rect.width / 2, rect.top + rect.height / 2, false, false, false, false, 0, null);
                    element.dispatchEvent(evt);
                }

                //3.2 计算移动的总步数和总时间 -> 步长相同，完成每一步的时间不同
                let defaultStep = 5; //默认步长5px
                let stepX = 0;
                let stepY = 0;
                let totalSteps = 0;
                if (args.left != 0) //如果需要在水平方向上移动
                {
                    stepX = defaultStep;
                    stepY = Math.ceil(stepX * args.top / args.left);
                    totalSteps = args.left / stepX;
                } else {
                    stepX = 0;
                    if (args.top == 0)
                        totalSteps = stepY = 0;
                    else {
                        stepY = defaultStep;
                        totalSteps = args.top / stepY;
                    }
                }
                let totalTime = 0;

                //3.3 计算时间序列
                let timeSequence = [0]
                for (let i = 1; i < totalSteps; i++) {
                    let randomNumber = Math.ceil(Math.random() * 15) + 10; //[10-25]ms
                    timeSequence.push(timeSequence[i - 1] + randomNumber);
                }
                totalTime = timeSequence[totalSteps - 1];

                //3.4 start dragging process
                for (let triggerTime of timeSequence) {
                    setTimeout(function () {
                        let rect = element.getBoundingClientRect();
                        evt.initMouseEvent("mousemove", true, true, window, 1, 0, 0, rect.left + rect.width / 2 + stepX, rect.top + rect.height / 2 + stepY, false, false, false, false, 0, null);
                        element.dispatchEvent(evt);
                    }, triggerTime);
                }

                //3.5  release dragged element
                let end_types = ["drop", "dragend", "mouseup"];
                setTimeout(function () {
                    for (const type of end_types) {
                        let rect = element.getBoundingClientRect();
                        evt.initMouseEvent(type, true, true, window, 1, 0, 0, rect.left + rect.width / 2, rect.top + rect.height / 2, false, false, false, false, 0, null);
                        element.dispatchEvent(evt);
                    }
                    window.isDragToCompleted = true; //通过此标志来判断拖拽是否完成
                }, totalTime);
            },
            selectorFromActive: (args) => {
                const element = document.activeElement
                if (element && !domUtils.matchElementType(element, TAGS.body)) {
                    const sPath = domUtils.buildSelector(element)
                    if (domUtils.matchElementType(element, TAGS.IFRAME, TAGS.FRAME))
                        return new Tunneling(element, { sPath: args.sPath ? args.sPath.concat(sPath) : sPath })
                    else
                        return args.sPath ? args.sPath.concat(sPath) : sPath
                } else {
                    return null
                }
            },
            getActiveElement: (args) => {
                const element = document.activeElement
                if (element && !domUtils.matchElementType(element, TAGS.body)) {
                    if (domUtils.matchElementType(element, TAGS.IFRAME, TAGS.FRAME))
                        return new Tunneling(element)
                    else
                        return domUtils.uidFromElement(element)
                } else {
                    return null
                }
            },
            documentHasFocus: (args) => {
                return document.hasFocus()
            },
            fetch: (args) => {
                let requestOptions = {
                    method: args.method
                };
                if (args.headers)
                    requestOptions.headers = args.headers
                if (args.body)
                    requestOptions.body = args.body

                //重置变量
                fetch_result = null
                fetch_finish = false

                fetch(args.url, requestOptions)
                    .then(res => {
                        fetch_result = {
                            'status_code': res.status,
                            'content_type': '',
                            'content_encoding': '',
                            'content': '',
                        }








                        if (res.ok) {
                            res.headers.forEach(function (val, key) {
                                if (key == 'content-type')
                                    fetch_result['content_type'] = val
                                else if (key == 'content-encoding')
                                    fetch_result['content_encoding'] = val
                            });

                            //body
                            if (args.filename) {
                                return res.blob()
                            } else {
                                return res.text()
                            }


                        } else {
                            fetch_finish = true
                        }
                    })
                    .catch(error => {
                        fetch_finish = true
                        fetch_result = { 'error': error.message }
                    })
                    .then(data => {
                        if (data && args.filename) {
                            const reader = new FileReader;
                            reader.onerror = (error) => {
                                fetch_finish = true
                                fetch_result['error'] = error
                            }
                            reader.onload = () => {
                                fetch_finish = true
                                if (reader.result)
                                    fetch_result['content'] = btoa(reader.result)
                            };
                            reader.readAsBinaryString(data)
                        } else if (data) {
                            fetch_finish = true
                            fetch_result['content'] = data
                        }
                    })
            },
            getScroll: (args) => {
                let element = null
                if (args.elementId) {
                    element = domUtils.ElementFromUid(args.elementId)
                } else {
                    element = document.documentElement
                }
                if (args.searchUp){
                    element = domUtils.getScrollableParent(element, args.direction)
                }

                if (args.direction == 'vertical') {
                    if (args.location == 'Current')
                        return element.scrollTop
                    else
                        return element.scrollHeight
                } else {
                    if (args.location == 'Current')
                        return element.scrollLeft
                    else
                        return element.scrollWidth
                }
            }
        }

        this.version = 'e54893c433271cb29b0dbed9b76d9b81'
        this.frameBackendId = null
        this.invoke = function (actionName, args) {
            function failure(code, message) {
                return {
                    status: 'failure',
                    error: {
                        code: code,
                        message: message
                    }
                }
            }

            function uiaFailure(code, message) {
                return {
                    status: 'uiafailure',
                    error: {
                        code: code,
                        message: message
                    }
                }
            }

            try {
                const action = actions[actionName]
                if (!action)
                    return failure(1, `找不到指定的Action, ${actionName}`)
                const result = action.call(window, args)
                if (result instanceof Tunneling) {
                    return {
                        status: 'tunneling',
                        route: result
                    }
                } else if (result instanceof Bubbling) {
                    return {
                        status: 'bubbling',
                        route: result
                    }
                } else {
                    return {
                        status: 'success',
                        result: result === undefined ? null : result
                    }
                }
            } catch (error) {
                if (error instanceof ActionError) {
                    return failure(1, error.message) //Common
                } else if (error instanceof UIAError) {
                    return uiaFailure(error.code, error.message)
                } else { //Unknown
                    return failure(-1, error.stack || error.message || error)
                }
            }
        }
    }
})()