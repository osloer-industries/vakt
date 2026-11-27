class Vakt < Formula
  desc "Secure MCP runtime — policy, audit, registry, multi-provider sync"
  homepage "https://github.com/tn819/vakt"
  version "0.11.2"

  on_macos do
    on_arm do
      url "https://github.com/tn819/vakt/releases/download/v0.11.2/vakt-0.11.2-darwin-arm64.tar.gz"
      sha256 "8ba763c8db8bc81c552ca70270836dac2e295f5a622a04e71c3c1756d31006e8"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/tn819/vakt/releases/download/v0.11.2/vakt-0.11.2-linux-x86_64.tar.gz"
      sha256 "02537e6dc890ea8bf8e85c5c978f659ecf5ecc3dfc5a0c84fcd526fcd06f5e98"
    end
  end

  def install
    bin.install "vakt"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/vakt --version")
  end
end
