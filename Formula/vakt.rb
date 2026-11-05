class Vakt < Formula
  desc "Secure MCP runtime — policy, audit, registry, multi-provider sync"
  homepage "https://github.com/tn819/vakt"
  version "0.10.1"

  on_macos do
    on_arm do
      url "https://github.com/tn819/vakt/releases/download/v0.10.1/vakt-0.10.1-darwin-arm64.tar.gz"
      sha256 "8dda151c864cffd3889bf3d1c7620c16d41f99418dc4ebdef3e811923c1abbe1"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/tn819/vakt/releases/download/v0.10.1/vakt-0.10.1-linux-x86_64.tar.gz"
      sha256 "d60cd681daea30e9b353952da99d78570764d635ae70502262109f651cdb5518"
    end
  end

  def install
    bin.install "vakt"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/vakt --version")
  end
end
