// Downloads and unpacks a volume (region map, MRI) off the main thread, so
// the page stays responsive while tens of megabytes are decompressed.
//
// Message in:  { id, url, delta, plane, priority }
//   url       absolute URL of the file (gzip, or already decoded by the server)
//   delta     true when slice z stores (slice z - slice z-1) mod 256 ("delta-depth")
//   plane     voxels per slice (width × height), needed for delta
//   priority  optional fetch priority hint ('low' for background prefetch)
// Message out: { id, data } (the Uint8Array's buffer is transferred) or { id, error }

self.onmessage = async e => {
  const { id, url, delta, plane, priority } = e.data;
  try {
    const res = await fetch(url, priority ? { priority } : undefined);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    let data = new Uint8Array(await res.arrayBuffer());
    if (data[0] === 0x1f && data[1] === 0x8b) { // gzip (servers usually send .gz as-is)
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    if (delta && plane > 0) {
      // Undo the slice-to-slice differences (running sum, mod 256).
      for (let cur = plane; cur < data.length; cur += plane) {
        const prev = cur - plane;
        for (let i = 0; i < plane; i++) data[cur + i] = (data[cur + i] + data[prev + i]) & 255;
      }
    }
    self.postMessage({ id, data }, [data.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
