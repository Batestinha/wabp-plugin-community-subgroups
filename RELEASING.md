# Releasing

Release only with the **Release standalone plugin** workflow (Actions, then Run workflow, with the full commit SHA on `main`), never from a workstation.

- It builds in the pinned Fedora 44 container (`zlib-ng-compat-2.3.3-3.fc44`), runs the tests, builds the archive twice, checks that it loads outside the repository, then creates `v<version>` at that commit with the archive attached. The WABS index entry points at that asset, with its SHA-256.
- The archive's tar bytes are reproducible everywhere, but its gzip bytes depend on the zlib implementation (stock zlib and zlib-ng compress differently). That is why the builder is pinned, and why `validate.yml` builds in the same container.
- For a version that is already installed somewhere, pass that archive's SHA-256 as `expected_sha256`. WABP refuses a version whose bytes change ("already names different immutable bytes"), so the release must carry exactly those bytes.
- A local `npm run release:archive` is for testing. Its output names the `zlib` it used, and it reproduces the release bytes only with the same one (Fedora 44 prints `1.3.1.zlib-ng`).
- Bump the version in `package.json`, `package-lock.json` (twice), `wa-plugin.json` and `src/manifest.ts` before releasing changed content. Anything in the package's `files` list, including `README.md`, changes the archive.

## Published before the canonical builder

`v0.1.1` (`official.community-subgroups-0.1.1.tgz`, SHA-256 `05dc5a8327a0b01280e207e4102752c854597b5f1ddfd2abfc5d6d861174e880`) was built by the previous Ubuntu CI builder (stock zlib). It stays as published, because a version's bytes never change. A Fedora 44 build of the same commit gives `2b97c385a2ca5b565f7063bd01853ac65375b3cb0cb91c223f66c3db8997d2ce` from the identical tar stream (`d77c79e44b15bc9f52aeff86dc7171cbc821e70a492ab2482e669ef845dc31c7`). No check compares a fresh build of 0.1.1 or earlier with those assets; versions after 0.1.1 come from `release.yml`.

Earlier releases also attached a signature, `SHA256SUMS`, `validation.json` and a public key. WABP and the WABS index use only the archive and its SHA-256, so `release.yml` attaches the archive alone.
