import { lstat, realpath } from 'node:fs/promises'
import { Command } from 'commander'
import {
  agentSkillDirectory,
  compatibleWithSkill,
  configuredAgents,
  inspectUserConfiguration,
  localBootstrapHarness
} from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { readRepositoryDeclaration } from '../../core/configuration/index.ts'
import { KiExit } from '../../core/errors.ts'
import { canonicalHarnessIdentifier, discoverInstalledHarnesses } from '../../core/harness/index.ts'
import {
  inspectManageDoctor,
  type ManageCheckStatus,
  type ManageDoctorCheck,
  type ManageDoctorPort
} from '../../core/manage/index.ts'
import { canonicalHarnessDevelopmentEnabled } from '../../core/storage/index.ts'
import { presentation, renderTree } from '../presentation/index.ts'

const mark = (status: ManageCheckStatus): string => presentation(`status.${status}`).terminal

const doctorPort = (context: KiContext): ManageDoctorPort => ({
  inspectConfiguration: () => inspectUserConfiguration(context.paths.config),
  configuredAgents: async () =>
    (
      await configuredAgents({
        homeDirectory: context.homeDirectory,
        configurationDirectory: context.paths.config
      })
    ).map((agent) => ({
      id: agent.descriptor.id,
      home: agent.home,
      userSkills: agentSkillDirectory(agent, 'user'),
      supports: (runtimes) => compatibleWithSkill(agent, runtimes)
    })),
  discoverHarnesses: () => discoverInstalledHarnesses(context.paths.data),
  localDevelopmentEnabled: (source) => canonicalHarnessDevelopmentEnabled(context.paths.data, source),
  inspectLocalHarness: (source) => localBootstrapHarness(source),
  readRepositorySkills: async (path) => (await readRepositoryDeclaration(path)).skills,
  lstat: (path) => lstat(path).catch(() => undefined),
  realpath: (path) => realpath(path).catch(() => undefined)
})

const report = (context: KiContext, checks: readonly ManageDoctorCheck[]): void => {
  const totals = {
    pass: checks.filter((check) => check.status === 'pass').length,
    fail: checks.filter((check) => check.status === 'fail').length,
    skip: checks.filter((check) => check.status === 'skip').length
  }
  context.stdout.write(
    `${renderTree({
      title: 'KI MANAGE DOCTOR',
      entries: [
        {
          label: `checks (${checks.length})`,
          children: checks.map((check) => ({ label: `${mark(check.status)} ${check.label}: ${check.detail}` }))
        },
        { label: `summary: PASS=${totals.pass} FAIL=${totals.fail} SKIP=${totals.skip}` }
      ]
    }).join('\n')}\n`
  )
  if (checks.some((check) => check.status === 'fail')) throw new KiExit(1)
}

export const createDoctorCommand = (context: KiContext): Command =>
  new Command('doctor')
    .description('check KI configuration, agents, harnesses, user skills, and direct-CWD legacy state')
    .action(async () => {
      const checks = await inspectManageDoctor(doctorPort(context), {
        workingDirectory: context.workingDirectory,
        canonicalHarnessIdentifier
      })
      report(context, checks)
    })
