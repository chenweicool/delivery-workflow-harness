(function attachApi(global) {
  async function api(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 30000);
    const response = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {}),
      },
    }).catch((error) => {
      if (error.name === 'AbortError') {
        throw new Error('请求超时，请检查本地服务是否正常');
      }
      throw error;
    }).finally(() => clearTimeout(timeout));
    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    if (!response.ok) {
      throw new Error(data.error || `请求失败：${response.status}`);
    }
    return data;
  }

  global.DWApi = { api };
})(window);
