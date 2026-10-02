import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { extractFile } from "../src/extract";

async function makeEpub(opts: { opfDir?: string; hrefPrefix?: string } = {}) {
  const dir = opts.opfDir ?? "OEBPS/";
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file("META-INF/container.xml", `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="${dir}content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  zip.file(`${dir}content.opf`, `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Test Fic</dc:title><dc:creator>Someone</dc:creator></metadata><manifest><item id="pre" href="${opts.hrefPrefix ?? ""}preface.xhtml" media-type="application/xhtml+xml"/><item id="c1" href="${opts.hrefPrefix ?? ""}chapter%201.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="pre"/><itemref idref="c1"/></spine></package>`);
  zip.file(`${dir}preface.xhtml`, `<html xmlns="http://www.w3.org/1999/xhtml"><body><div class="meta"><dl class="tags"><dt>Rating:</dt><dd>Explicit</dd><dt>Category:</dt><dd>M/M</dd><dt>Fandom:</dt><dd>Supernatural</dd><dt>Relationship:</dt><dd>Castiel/Dean Winchester</dd><dt>Stats:</dt><dd>Words: 12</dd></dl></div></body></html>`);
  zip.file(`${dir}chapter 1.xhtml`, `<html xmlns="http://www.w3.org/1999/xhtml"><body><div id="chapters"><p>Dean kissed Castiel. Castiel kissed Dean back.</p></div></body></html>`);
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("EPUB upload", () => {
  it("reads an AO3-style EPUB", async () => {
    const bytes = await makeEpub();
    const file = new File([bytes], "fic.epub", { type: "application/epub+zip" });
    const w = await extractFile(file);
    expect(w.format).toBe("epub");
    expect(w.text).toContain("Dean kissed Castiel");
    expect(w.meta.fandoms).toContain("Supernatural");
  });
  it("accepts a .epub with no MIME type and ../ links", async () => {
    const bytes = await makeEpub({ opfDir: "OPS/pkg/", hrefPrefix: "../" });
    const zip = await JSZip.loadAsync(bytes);
    // Move the chapters up one folder to match the ../ hrefs.
    for (const n of ["preface.xhtml", "chapter 1.xhtml"]) {
      const c = await zip.file(`OPS/pkg/${n}`)!.async("string");
      zip.remove(`OPS/pkg/${n}`);
      zip.file(`OPS/${n}`, c);
    }
    const out = await zip.generateAsync({ type: "arraybuffer" });
    const w = await extractFile(new File([out], "Fic.EPUB"));
    expect(w.text).toContain("Castiel kissed Dean back");
  });
  it("explains a file that isn't a real EPUB", async () => {
    await expect(extractFile(new File(["not a zip"], "x.epub"))).rejects.toThrow(/valid zip|EPUB/i);
  });
});
