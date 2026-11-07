import { describe, expect, it } from 'vitest';

import { assertProxyHost, assertSafeDockerArgs, DockerCli } from './docker-cli.js';

describe('assertProxyHost', () => {
  it('accepts only the local TCP proxy', () => {
    expect(() => {
      assertProxyHost('tcp://127.0.0.1:23750');
    }).not.toThrow();
    for (const host of [
      '',
      'unix:///var/run/docker.sock',
      'npipe:////./pipe/docker_engine',
      'tcp://10.0.0.5:2375',
      'tcp://127.0.0.1:2375/extra',
    ]) {
      expect(() => {
        assertProxyHost(host);
      }, host).toThrow();
    }
  });

  it('makes DockerCli refuse to start without the proxy', () => {
    expect(() => new DockerCli('unix:///var/run/docker.sock')).toThrow(/socket proxy/);
  });
});

describe('assertSafeDockerArgs', () => {
  it('allows the arguments the sandbox uses', () => {
    expect(() => {
      assertSafeDockerArgs([
        'run',
        '-d',
        '--name',
        'janus-a-app',
        '--network',
        'janus-sbx',
        '--tmpfs',
        '/var/lib/postgresql/data',
        '--label',
        'janus.variant=a',
        'janus/shoplab-a:runner',
      ]);
    }).not.toThrow();
  });

  it.each([
    [['run', '-v', '/var/run/docker.sock:/var/run/docker.sock', 'img']],
    [['run', '--volume=/data:/data', 'img']],
    [['run', '--mount', 'type=bind,src=/,dst=/host', 'img']],
    [['run', '--privileged', 'img']],
    [['run', '--network', 'host', 'img']],
    [['run', '--network=host', 'img']],
    [['run', '--pid=host', 'img']],
    [['run', '--cap-add=SYS_ADMIN', 'img']],
    [['run', '--device', '/dev/kmsg', 'img']],
    [['run', '-e', 'X=//./pipe/docker_engine', 'img']],
  ])('refuses %j', (args) => {
    expect(() => {
      assertSafeDockerArgs(args);
    }).toThrow(/unsafe/);
  });

  it('lets cp copy a local folder into a container, never out of one', () => {
    expect(() => {
      assertSafeDockerArgs(['cp', 'C:/work/01JC/.', 'janus-tool-x:/src']);
    }).not.toThrow();
    expect(() => {
      assertSafeDockerArgs(['cp', '/work/01JC/.', 'janus-tool-x:/src']);
    }).not.toThrow();
    for (const args of [
      ['cp', 'janus-tool-x:/etc/passwd', '/tmp/passwd'],
      ['cp', 'janus-tool-x:/src', 'C:/Users'],
      ['cp', 'a:/x', 'b:/y'],
      ['cp', '/work/.', 'janus-a-app:/app'],
      ['cp', '-L', '/work/.', 'janus-tool-x:/src'],
    ]) {
      expect(() => {
        assertSafeDockerArgs(args);
      }).toThrow(/unsafe/);
    }
  });

  it.each(['buildx', 'builder', 'exec', 'volume', 'plugin', 'swarm'])(
    'refuses the %s command',
    (command) => {
      expect(() => {
        assertSafeDockerArgs([command, 'ls']);
      }).toThrow(/unsafe docker command/);
    },
  );
});
