import { describe, expect, it } from "vitest";

import { createNodeYunxinSdkFactory } from "./yunxinNode";

describe("createNodeYunxinSdkFactory", () => {
  it("creates the official ESM SDK without browser globals or network access", async () => {
    const sdk = await createNodeYunxinSdkFactory().create("test-app-key");

    expect(typeof sdk.V2NIMLoginService.login).toBe("function");
    expect(typeof sdk.V2NIMConversationService.getConversationList).toBe(
      "function",
    );
    expect(typeof sdk.V2NIMMessageService.sendMessage).toBe("function");

    await sdk.destroy();
  });
});
