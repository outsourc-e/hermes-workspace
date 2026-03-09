import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { NewProjectWizard } from '@/screens/projects/new-project-wizard'

export const Route = createFileRoute('/new-project')({
  component: function NewProjectRoute() {
    usePageTitle('New Project')
    return <NewProjectWizard />
  },
})
