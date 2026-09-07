# The Thursday container image.
#
# WHAT IS IN HERE: prerequisites only. node, pnpm, deno, git, and a non-root
# user. Thursday itself is NOT in this image and must not be added to it.
#
# WHY, decided by grill on 2026-09-07. Thursday is installed by the REAL
# installer when the container is created, which buys two things. E7's parity
# requirement comes free, because a containerised install runs the same code
# path as a native one rather than a Dockerfile's imitation of it. And the image
# never needs rebuilding when Thursday changes, because it holds no Thursday.
#
# The first version of this file claimed in its own comment to install Thursday
# by running install.sh, and did not: it ended at a bash prompt with nothing in
# it. If you are about to add a Thursday install step here, that is a design
# change and it needs a decision, not a commit.

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# curl and ca-certificates fetch node and deno; git is needed by the installer
# and by the eventual git-airlock model in G2; unzip is deno's installer.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      git \
      unzip \
    && rm -rf /var/lib/apt/lists/*

# node >= 24, which is what install.sh requires.
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable pnpm

# UID 1000 matches the usual first human user on the host, so files written
# through the bind-mounted scratch directory are owned by the person who owns
# the directory rather than by root.
# Ubuntu 24.04 ships a default `ubuntu` user already holding UID 1000, so
# creating ours fails with "UID 1000 is not unique" until that one is removed.
# Found by building the image; the first version of this file was never built.
RUN userdel -r ubuntu 2>/dev/null || true \
    && useradd -m -u 1000 -s /bin/bash thursday

USER thursday
WORKDIR /home/thursday

# deno for Thursday's operational scripts (S4). Installed per-user rather than
# system-wide so the image has no root-owned tooling the user cannot replace.
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/home/thursday/.deno sh -s -- --yes \
    && /home/thursday/.deno/bin/deno --version

ENV DENO_INSTALL=/home/thursday/.deno \
    PATH=/home/thursday/.deno/bin:/home/thursday/.local/bin:$PATH \
    THURSDAY_HOME=/home/thursday/.thursday

# The scratch directory is the one bind mount. It is created here so the mount
# lands on a directory owned by the thursday user rather than on root's.
RUN mkdir -p /home/thursday/.ai-scratch /home/thursday/.local/bin

ENTRYPOINT ["/bin/bash"]
CMD ["-l"]
