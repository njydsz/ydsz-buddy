/**
 * @file projectPaths 路径处理工具测试
 */

import {
  appendBrowsePathSegment,
  canNavigateUp,
  getBrowseDirectoryPath,
  getBrowseLeafPathSegment,
  getBrowseParentPath,
  getInitialBrowseQuery,
  hasTrailingPathSeparator,
  inferProjectTitleFromPath,
  isFilesystemBrowseQuery,
  isUnsupportedWindowsProjectPath,
  normalizeProjectPathForDispatch,
} from "./projectPaths";

describe("normalizeProjectPathForDispatch", () => {
  it("trims whitespace and trailing separators", () => {
    expect(normalizeProjectPathForDispatch("  /foo/bar/  ")).toBe("/foo/bar");
  });

  it("keeps the drive root intact", () => {
    expect(normalizeProjectPathForDispatch("C:\\")).toBe("C:\\");
  });

  it("re-adds trailing slash when path becomes just a drive letter", () => {
    expect(normalizeProjectPathForDispatch("C:")).toBe("C:\\");
  });
});

describe("inferProjectTitleFromPath", () => {
  it("returns the last segment of a unix path", () => {
    expect(inferProjectTitleFromPath("/Users/me/projects/my-app")).toBe("my-app");
  });

  it("returns the last segment of a windows path", () => {
    expect(inferProjectTitleFromPath("C:\\code\\my-app")).toBe("my-app");
  });

  it("returns the path itself when there is no segment", () => {
    expect(inferProjectTitleFromPath("/")).toBe("/");
  });
});

describe("hasTrailingPathSeparator", () => {
  it("detects trailing slash on unix path", () => {
    expect(hasTrailingPathSeparator("/foo/")).toBe(true);
  });

  it("detects trailing backslash on windows path", () => {
    expect(hasTrailingPathSeparator("C:\\foo\\")).toBe(true);
  });

  it("returns false when no trailing separator", () => {
    expect(hasTrailingPathSeparator("/foo")).toBe(false);
  });
});

describe("getBrowseDirectoryPath", () => {
  it("returns the same path if it ends with a separator", () => {
    expect(getBrowseDirectoryPath("/foo/")).toBe("/foo/");
  });

  it("returns directory portion when no trailing separator", () => {
    expect(getBrowseDirectoryPath("/foo/bar")).toBe("/foo/");
  });

  it("returns the same path if no separator", () => {
    expect(getBrowseDirectoryPath("foo")).toBe("foo");
  });
});

describe("getBrowseLeafPathSegment", () => {
  it("returns the last segment", () => {
    expect(getBrowseLeafPathSegment("/foo/bar/baz")).toBe("baz");
  });

  it("returns whole path when no separator", () => {
    expect(getBrowseLeafPathSegment("foo")).toBe("foo");
  });
});

describe("appendBrowsePathSegment", () => {
  it("appends with forward slash to unix path", () => {
    expect(appendBrowsePathSegment("/foo/", "bar")).toBe("/foo/bar/");
  });

  it("appends with backslash to windows path", () => {
    expect(appendBrowsePathSegment("C:\\foo\\", "bar")).toBe("C:\\foo\\bar\\");
  });
});

describe("getBrowseParentPath", () => {
  it("returns root for single-segment unix path", () => {
    expect(getBrowseParentPath("/foo")).toBe("/");
  });

  it("returns null at unix root", () => {
    expect(getBrowseParentPath("/")).toBeNull();
  });

  it("returns drive root for single-segment windows path", () => {
    expect(getBrowseParentPath("C:\\foo")).toBe("C:\\");
  });

  it("returns parent directory for multi-segment paths", () => {
    expect(getBrowseParentPath("/foo/bar/baz")).toBe("/foo/bar/");
  });
});

describe("canNavigateUp", () => {
  it("returns true for nested unix directory", () => {
    expect(canNavigateUp("/foo/")).toBe(true);
  });

  it("returns false at unix root", () => {
    expect(canNavigateUp("/")).toBe(false);
  });
});

describe("getInitialBrowseQuery", () => {
  it("returns ~/ when home is null", () => {
    expect(getInitialBrowseQuery(null)).toBe("~/");
  });

  it("appends trailing separator if missing", () => {
    expect(getInitialBrowseQuery("/Users/me")).toBe("/Users/me/");
  });

  it("keeps existing trailing separator", () => {
    expect(getInitialBrowseQuery("/Users/me/")).toBe("/Users/me/");
  });
});

describe("isFilesystemBrowseQuery", () => {
  it("recognizes relative paths", () => {
    expect(isFilesystemBrowseQuery("./foo", "Linux x86_64")).toBe(true);
    expect(isFilesystemBrowseQuery("../foo", "Linux x86_64")).toBe(true);
  });

  it("recognizes absolute unix path", () => {
    expect(isFilesystemBrowseQuery("/Users/me", "MacIntel")).toBe(true);
  });

  it("recognizes tilde home shortcut", () => {
    expect(isFilesystemBrowseQuery("~/projects", "MacIntel")).toBe(true);
  });

  it("does not accept windows path on non-windows", () => {
    expect(isFilesystemBrowseQuery("C:\\foo", "MacIntel")).toBe(false);
  });

  it("accepts windows path on windows", () => {
    expect(isFilesystemBrowseQuery("C:\\foo", "Win32")).toBe(true);
  });
});

describe("isUnsupportedWindowsProjectPath", () => {
  it("returns true for windows path on mac", () => {
    expect(isUnsupportedWindowsProjectPath("C:\\foo", "MacIntel")).toBe(true);
  });

  it("returns false for windows path on windows", () => {
    expect(isUnsupportedWindowsProjectPath("C:\\foo", "Win32")).toBe(false);
  });

  it("returns false for unix path on mac", () => {
    expect(isUnsupportedWindowsProjectPath("/Users/me", "MacIntel")).toBe(false);
  });
});
