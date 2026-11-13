class Vakt < Formula
  desc "Secure MCP runtime — policy, audit, registry, multi-provider sync"
  homepage "https://github.com/tn819/vakt"
  version "0.10.4"

  on_macos do
    on_arm do
      url "https://github.com/tn819/vakt/releases/download/v0.10.4/vakt-0.10.4-darwin-arm64.tar.gz"
      sha256 "16facf5d32d920d2adb7d0281cfbae5030dc49c260470f91366f6e06ac96826e"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/tn819/vakt/releases/download/v0.10.4/vakt-0.10.4-linux-x86_64.tar.gz"
      sha256 "0febaecb2b86b77e2f02982f888e235661d574dbe40b1e9bbead4cbe497c28f8"
    end
  end

  def install
    bin.install "vakt"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/vakt --version")
  end
end
