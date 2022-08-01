FROM maven:3.8.5-openjdk-17-slim

RUN apt-get update \
    && apt-get install -y xz-utils git
RUN rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/node \
    && curl -fsSL https://nodejs.org/dist/v16.16.0/node-v16.16.0-linux-x64.tar.xz | tar -xJf - -C /opt/node

ENV PATH="${PATH}:/opt/node/node-v16.16.0-linux-x64/bin"

RUN npm install typescript --location=global \
 && npm install ts-node --location=global \
 && npm install @types/node --location=global

CMD ["/bin/bash"]
