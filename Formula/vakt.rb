class Vakt < Formula
  desc "Secure MCP runtime — policy, audit, registry, multi-provider sync"
  homepage "https://github.com/tn819/vakt"
  version "0.11.0"

  on_macos do
    on_arm do
      url "https://github.com/tn819/vakt/releases/download/v0.11.0/vakt-0.11.0-darwin-arm64.tar.gz"
      sha256 "1c9e2c38c468a9cfe66fe85ce8e7fe03afff1ebe3a9d32ebf6bce6b3665fcf17"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/tn819/vakt/releases/download/v0.11.0/vakt-0.11.0-linux-x86_64.tar.gz"
      sha256 "e6cecf9a895258a294ed488c3c053e4aa60c0e3c1719a00c80c9710acdbf65cb"
    end
  end

  def install
    bin.install "vakt"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/vakt --version")
  end
end
