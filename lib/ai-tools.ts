export const editTools = {
  replaceContent: {
    name: "replaceContent",
    description: "Replace content at a specific location in a file",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "File path" },
        selector: { type: "string", description: "CSS selector or line range (L10-L15)" },
        oldContent: { type: "string", description: "Existing content to verify" },
        newContent: { type: "string", description: "New content" }
      },
      required: ["file", "selector", "newContent"]
    }
  },

  insertContent: {
    name: "insertContent",
    description: "Insert content before, after, or inside an element",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string" },
        position: { type: "string", enum: ["before", "after", "prepend", "append"] },
        selector: { type: "string" },
        content: { type: "string" }
      },
      required: ["file", "position", "selector", "content"]
    }
  },

  deleteContent: {
    name: "deleteContent",
    description: "Delete an element or section",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string" },
        selector: { type: "string" }
      },
      required: ["file", "selector"]
    }
  },

  createFile: {
    name: "createFile",
    description: "Create a new file",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
        fileType: { type: "string", enum: ["page", "partial", "style", "script"] }
      },
      required: ["path", "content", "fileType"]
    }
  },

  deleteFile: {
    name: "deleteFile",
    description: "Delete a file",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" }
      },
      required: ["path"]
    }
  },

  renameFile: {
    name: "renameFile",
    description: "Rename a file",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" }
      },
      required: ["from", "to"]
    }
  },

  updateStyle: {
    name: "updateStyle",
    description: "Update CSS rules",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector" },
        properties: { type: "object", description: "CSS properties" },
        action: { type: "string", enum: ["merge", "replace"] }
      },
      required: ["selector", "properties"]
    }
  },

  batchEdit: {
    name: "batchEdit",
    description: "Perform multiple edits atomically",
    parameters: {
      type: "object",
      properties: {
        operations: { type: "array", items: { type: "object" } }
      },
      required: ["operations"]
    }
  }
};
