// 백엔드가 같은 origin에서 정적 파일을 제공하므로 배포 주소를 하드코딩하지 않는다.
export const token = () => sessionStorage.getItem("twin_token");
export const setToken = (value) =>
  value
    ? sessionStorage.setItem("twin_token", value)
    : sessionStorage.removeItem("twin_token");
export async function api(
  path,
  { method = "GET", body, form, file, timeout = 20000 } = {},
) {
  const headers = {};
  const requestToken = token();
  if (token()) headers.Authorization = `Bearer ${token()}`;
  let payload;
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(form);
  } else if (file) {
    payload = new FormData();
    payload.append("file", file);
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`/api${path}`, {
      method,
      headers,
      body: payload,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (requestToken && token() !== requestToken) throw new Error("로그인 세션이 변경되었습니다.");
    if (!response.ok) {
      if (response.status === 401 && !path.startsWith("/auth/")) {
        setToken(null);
        window.dispatchEvent(new Event("signed-out"));
      }
      throw new Error(
        Array.isArray(data.detail)
          ? data.detail.map((x) => x.msg).join(" / ")
          : data.detail || `요청 실패 (${response.status})`,
      );
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error(
        "서버 응답이 늦습니다. 잠시 후 다시 시도하세요. 저장 요청이었다면 목록을 먼저 확인하세요.",
      );
    if (error instanceof TypeError)
      throw new Error(
        "서버에 연결하지 못했습니다. 연결을 확인하고 다시 시도하세요.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
