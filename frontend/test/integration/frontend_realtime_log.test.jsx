import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const handlers = {};

const mockSocket = {
  on: vi.fn((event, cb) => {
    handlers[event] = cb;
  }),
  emit: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock("socket.io-client", () => ({
  default: vi.fn(() => mockSocket),
}));

vi.mock("axios", () => ({
  default: {
    post: vi.fn(() => Promise.resolve({ data: { task_id: "task-123456" } })),
    get: vi.fn(() => Promise.resolve({ data: [] })),
  },
}));

import CrawlerMain from "../../src/features/crawler_main/CrawlerMain.jsx";

describe("CrawlerMain realtime logs", () => {
  it("renders incoming crawl_log messages for the selected task", async () => {
    render(<CrawlerMain />);

    const createBtn = await screen.findByRole("button", { name: "创建任务" });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText("启动")).toBeDefined();
    });

    const handler = handlers.crawl_log;
    expect(typeof handler).toBe("function");

    act(() => {
      handler({
        timestamp: "2025-12-14 22:45:23",
        level: "INFO",
        message: "Crawl success: Test Page",
        event_type: "PageCrawledEvent",
        task_id: "task-123456",
        data: {
          url: "https://example.com",
          title: "Test Page",
          depth: 1,
          pdf_count: 0,
        },
      });
    });

    await screen.findByText(/Test Page/);
  });
});
