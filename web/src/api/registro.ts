export type ApiResult = {
  ok: boolean
  message: string
  [key: string]: unknown
}

export async function postForm(
  url: string,
  fields: Record<string, string | string[]>,
): Promise<ApiResult> {
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      value.forEach((item) => body.append(key, item))
    } else {
      body.append(key, value)
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body,
  })

  const data = (await response.json().catch(() => null)) as ApiResult | null
  if (!data) {
    return {
      ok: false,
      message: 'No se pudo procesar el registro. Intenta de nuevo.',
    }
  }
  return data
}
