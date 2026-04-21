import { bitbucketCommand } from './bitbucket';

describe('bitbucketCommand', () => {
  it('registers the auth and resource subcommands', () => {
    expect(bitbucketCommand.name()).toBe('bitbucket');

    const subcommands = bitbucketCommand.commands.map((command) => command.name());
    expect(subcommands).toEqual(
      expect.arrayContaining(['auth', 'repo', 'pr', 'pipeline', 'issue'])
    );
  });
});
