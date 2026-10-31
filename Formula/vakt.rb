class Vakt < Formula
  desc "Secure MCP runtime — policy, audit, registry, multi-provider sync"
  homepage "https://github.com/tn819/vakt"
  version "0.10.0"

  on_macos do
    on_arm do
      url "https://github.com/tn819/vakt/releases/download/v0.10.0/vakt-0.10.0-darwin-arm64.tar.gz"
      sha256 "1e36ae9dbac329fae1eadc4e31b9c97d38a4e2460489c585f4299ba26e6081d0"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/tn819/vakt/releases/download/v0.10.0/vakt-0.10.0-linux-x86_64.tar.gz"
      sha256 "8997603a56f8f7bf3117d389b3d0f99b5820e6bdcbc6767ab805e618c4fff750"
    end
  end

  def install
    bin.install "vakt"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/vakt --version")
  end
end
