import { Card, CardContent } from '../ui/card'
import { MembersTable } from '../MembersTable'
import type { Member } from '../../types'

interface MembersTabProps {
  members: Member[]
  loading: boolean
  onView: (member: Member) => void
  onEdit: (member: Member) => void
  onDelete: (member: Member) => void
  onActivate: (member: Member) => void
  onCreate: () => void
}

export function MembersTab({
  members,
  loading,
  onView,
  onEdit,
  onDelete,
  onActivate,
  onCreate,
}: MembersTabProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <MembersTable
          members={members}
          loading={loading}
          onView={onView}
          onEdit={onEdit}
          onDelete={onDelete}
          onActivate={onActivate}
          onCreate={onCreate}
        />
      </CardContent>
    </Card>
  )
}
