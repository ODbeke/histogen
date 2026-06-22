import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import App from "../App";

// Mock Framer Motion to prevent errors in jsdom environment
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    h1: ({ children, ...props }: any) => <h1 {...props}>{children}</h1>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
    tr: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe("HistoGen App Component", () => {
  it("renders the app title and primary layout elements", () => {
    render(<App />);
    
    // Check that HistoGen logo/title is displayed in the header
    const headers = screen.getAllByText("HistoGen");
    expect(headers.length).toBeGreaterThan(0);

    // Check that the main technology description is present
    expect(
      screen.getByText(/Utilizing Intelligent Contracts on GenLayer/i)
    ).toBeInTheDocument();

    // Check that the Ledger section is rendered
    expect(screen.getByText("Verified Truth Ledger")).toBeInTheDocument();
  });

  it("prompts the user to connect their wallet initially", () => {
    render(<App />);
    
    // Check for the Connect Wallet button
    expect(screen.getByText("Connect Wallet")).toBeInTheDocument();
    
    // Textarea and input should have the connect wallet placeholder
    const elements = screen.getAllByPlaceholderText("Connect wallet to start validating...");
    expect(elements.length).toBe(2);
    expect(elements[0]).toBeDisabled();
    expect(elements[1]).toBeDisabled();
  });
});
