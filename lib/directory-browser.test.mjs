import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

async function loadSubject() {
  return import("./directory-browser.ts");
}

test("lists directories and directory symlinks without returning files", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "omp-web-browse-"));
  try {
    await mkdir(path.join(root, "project"));
    await writeFile(path.join(root, "notes.txt"), "test", "utf8");
    try {
      await symlink(path.join(root, "project"), path.join(root, "linked-project"));
    } catch (error) {
      // Windows without Developer Mode/admin rights cannot create symlinks.
      if (error?.code === "EPERM") {
        t.skip("Creating symbolic links requires additional privileges on this platform");
        return;
      }
      throw error;
    }

    const { listDirectories } = await loadSubject();
    const directories = await listDirectories(root);

    assert.deepEqual(directories.map((entry) => entry.name), ["linked-project", "project"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("expands home-relative paths and rejects missing directories", async () => {
  const { getBrowseStartDirectory, normalizeDirectory, resolveDirectory, shouldShowWindowsDrivePicker, getWindowsDriveCandidates } = await loadSubject();
  assert.equal(getBrowseStartDirectory(), homedir());
  assert.equal(getBrowseStartDirectory("/project"), "/project");
  assert.equal(shouldShowWindowsDrivePicker(undefined, "win32"), true);
  assert.equal(shouldShowWindowsDrivePicker(undefined, "darwin"), false);
  assert.equal(shouldShowWindowsDrivePicker("C:\\Projects", "win32"), false);
  assert.deepEqual(getWindowsDriveCandidates().at(0), { name: "A:", path: "A:\\" });
  assert.deepEqual(getWindowsDriveCandidates().at(-1), { name: "Z:", path: "Z:\\" });
  assert.equal(normalizeDirectory("~/project"), path.join(homedir(), "project"));
  await assert.rejects(resolveDirectory(path.join(tmpdir(), `omp-web-missing-${Date.now()}`)));
});

test("finds parent directories across POSIX and Windows paths", async () => {
  const { getParentDirectory } = await loadSubject();

  assert.equal(getParentDirectory("/Users/alex/project"), "/Users/alex");
  assert.equal(getParentDirectory("/"), null);
  assert.equal(getParentDirectory("C:\\Users\\Alex\\project"), "C:\\Users\\Alex");
  assert.equal(getParentDirectory("C:\\"), null);
});

test("accepts only single-segment new folder names", async () => {
  const { isValidNewDirectoryName } = await loadSubject();
  assert.equal(isValidNewDirectoryName("my-project", "linux"), true);
  assert.equal(isValidNewDirectoryName("新建文件夹", "linux"), true);
  assert.equal(isValidNewDirectoryName("a:b", "linux"), true);
  for (const name of ["", ".", "..", "a/b", "../escape", "a\\b", "a\0b"]) {
    assert.equal(isValidNewDirectoryName(name, "linux"), false, JSON.stringify(name));
  }
  for (const name of ["a:b", "a?b", "a*b", "a|b", 'a"b', "a<b"]) {
    assert.equal(isValidNewDirectoryName(name, "win32"), false, JSON.stringify(name));
  }
});

test("creates a folder inside the parent and refuses to reuse an existing name", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omp-web-mkdir-"));
  try {
    const { createDirectory, listDirectories } = await loadSubject();
    assert.equal(await createDirectory(root, "fresh"), path.join(root, "fresh"));
    assert.deepEqual((await listDirectories(root)).map((entry) => entry.name), ["fresh"]);
    await assert.rejects(createDirectory(root, "fresh"), { code: "EEXIST" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
