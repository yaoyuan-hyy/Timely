import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT ?? 3000);
const root = join(process.cwd(), "public");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function resolvePath(url) {
  const pathname = new URL(url, `http://localhost:${port}`).pathname;
  const filePath = pathname === "/" ? "/index.html" : pathname;
  return normalize(join(root, filePath));
}

const server = createServer(async (request, response) => {
  try {
    const filePath = resolvePath(request.url ?? "/");
    const data = await readFile(filePath);
    const type = contentTypes[extname(filePath)] ?? "application/octet-stream";
    response.writeHead(200, { "Content-Type": type });
    response.end(data);
  } catch {
    const data = await readFile(join(root, "index.html"));
    response.writeHead(200, { "Content-Type": contentTypes[".html"] });
    response.end(data);
  }
});

server.listen(port, () => {
  console.log(`Timely dev server running at http://localhost:${port}`);
});

