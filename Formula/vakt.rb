class Vakt < Formula
  desc "Secure MCP runtime — policy, audit, registry, multi-provider sync"
  homepage "https://github.com/tn819/vakt"
  version "0.11.1"

  on_macos do
    on_arm do
      url "https://github.com/tn819/vakt/releases/download/v0.11.1/vakt-0.11.1-darwin-arm64.tar.gz"
      sha256 "05ba79a8f867006a98fdb7247a98ede50f090677c00e9901025b012d558760de"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/tn819/vakt/releases/download/v0.11.1/vakt-0.11.1-linux-x86_64.tar.gz"
      sha256 "178ed271cbb3af2d12a2fb73b2d3a9253a9939812582515d426010ec49622695"
    end
  end

  def install
    bin.install "vakt"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/vakt --version")
  end
end
