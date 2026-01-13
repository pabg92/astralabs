import { promises as fs } from 'fs'
import path from 'path'
import { parseChangelog } from '@/lib/changelog/parser'
import { ChangelogView } from './changelog-view'

// Revalidate on every request to show latest changelog
export const revalidate = 0

export const metadata = {
  title: 'Changelog - ContractBuddy',
  description: 'All notable changes to ContractBuddy - AI-powered contract reconciliation platform',
}

export default async function ChangelogPage() {
  const filePath = path.join(process.cwd(), 'CHANGELOG.md')
  const content = await fs.readFile(filePath, 'utf-8')
  const entries = parseChangelog(content)

  return <ChangelogView entries={entries} />
}
