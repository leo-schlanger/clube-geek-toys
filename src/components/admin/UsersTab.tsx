import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Plus, Shield, UserCog } from 'lucide-react'

interface SystemUser {
  id: string
  email: string
  role: string
  createdAt?: string
}

interface UsersTabProps {
  users: SystemUser[]
  onCreateUser: () => void
  onUpdateRole: (userId: string, newRole: string) => void
}

export function UsersTab({ users, onCreateUser, onUpdateRole }: UsersTabProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Usuários do Sistema</CardTitle>
            <CardDescription>Gerencie o acesso e cargos dos usuários cadastrados</CardDescription>
          </div>
          <Button onClick={onCreateUser}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Usuário
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-3 px-4 font-medium text-sm">Usuário</th>
                <th className="text-left py-3 px-4 font-medium text-sm">Cargo</th>
                <th className="text-left py-3 px-4 font-medium text-sm">Cadastro em</th>
                <th className="text-right py-3 px-4 font-medium text-sm">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="py-4 px-4">
                    <div>
                      <p className="font-medium">{user.email}</p>
                      <p className="text-xs text-muted-foreground font-mono">{user.id}</p>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <Badge variant={user.role === 'admin' ? 'black' : user.role === 'seller' ? 'gold' : 'silver'}>
                      {user.role === 'admin' && <Shield className="h-3 w-3 mr-1 inline" />}
                      {user.role}
                    </Badge>
                  </td>
                  <td className="py-4 px-4 text-sm text-muted-foreground">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString('pt-BR') : 'N/A'}
                  </td>
                  <td className="py-4 px-4 text-right">
                    <select
                      value={user.role}
                      onChange={(e) => onUpdateRole(user.id, e.target.value)}
                      className="bg-muted text-xs p-1 rounded border border-border"
                    >
                      <option value="member">Membro</option>
                      <option value="seller">Vendedor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {users.length === 0 && (
            <div className="text-center py-12">
              <UserCog className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground font-medium">Nenhum usuário encontrado</p>
              <p className="text-xs text-muted-foreground mt-1">
                Os usuários aparecem aqui após se cadastrarem na plataforma
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
