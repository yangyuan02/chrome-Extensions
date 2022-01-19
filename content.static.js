function invoke(method, params) {
    try {
        if (method === 'init') {
            const result = eval.call(window, params.code)
            return { status: 'success', result: result }
        } else {
            if (typeof uiaDispatcher === 'undefined' || uiaDispatcher.version != params.contentVersion) {
                return { status: 'needInit', message: 'content need init' }
            } else {
                return uiaDispatcher.invoke(method, params)
            }
        }
    } catch (error) {
        return {
            status: 'failure',
            error: {
                code: -1, // UIAERROR_CODE.Unknown
                message: error.stack
            }
        }
    }
}
