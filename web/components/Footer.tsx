export function Footer() {
  return (
    <footer className="border-t border-zinc-800 px-4 py-4 text-center">
      <p className="text-[10px] text-amber/80">
        ⚠ AI-generated content can make mistakes. Discuss the details with a coach before acting on it.
      </p>
      <p className="text-[10px] text-zinc-600 mt-1">
        © {new Date().getFullYear()} CRIC HQ. All rights reserved.
      </p>
    </footer>
  );
}
