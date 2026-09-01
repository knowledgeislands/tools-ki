import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { auditAgoras } from '../../core/agora/index.ts'
import { KiExit } from '../../core/errors.ts'
import { renderTree } from '../presentation/index.ts'

export const createAgoraAuditCommand = (context: KiContext): Command =>
  new Command('audit')
    .description('audit declared Agora health')
    .argument('[agora]', 'Agora name')
    .action(async (value?: string) => {
      const report = await auditAgoras(context.paths.state, value)
      const healthy = report.profiles.filter((profile) => !profile.findings.length).length
      const findings =
        report.estateFindings.length + report.profiles.reduce((total, profile) => total + profile.findings.length, 0)
      const profiles = report.profiles.length
        ? report.profiles.map((profile) => ({
            label: `${profile.id} [${profile.findings.length ? 'unhealthy' : 'healthy'}] FINDINGS=${profile.findings.length}`,
            ...(profile.findings.length ? { children: profile.findings.map((finding) => ({ label: finding })) } : {})
          }))
        : [{ label: 'none' }]

      context.stdout.write(
        `${renderTree({
          title: 'KI AGORA AUDIT',
          entries: [
            { label: `profiles (${report.profiles.length})`, children: profiles },
            ...(report.estateFindings.length
              ? [
                  {
                    label: `estate findings (${report.estateFindings.length})`,
                    children: report.estateFindings.map((finding) => ({ label: finding }))
                  }
                ]
              : []),
            {
              label: `summary: PROFILES=${report.profiles.length} HEALTHY=${healthy} UNHEALTHY=${report.profiles.length - healthy} FINDINGS=${findings}`
            }
          ]
        }).join('\n')}\n`
      )
      if (findings) throw new KiExit(1)
    })
