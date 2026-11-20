export function previewClientMetadataResponse(url, workerEnv) {
  if (workerEnv?.IS_PREVIEW !== "true") {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return Response.json({
    client_id: url.href,
    client_name: "SyrianFatora Preview E2E Client",
    redirect_uris: ["https://example.com/oauth/callback"],
    response_types: ["code"],
    grant_types: ["authorization_code", "refresh_token"],
    token_endpoint_auth_method: "none",
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
