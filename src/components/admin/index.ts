export { MembersTab } from './MembersTab'
export { UsersTab } from './UsersTab'
export { LogsTab } from './LogsTab'
export { ReportsTab } from './ReportsTab'
// ProductsTab e OrdersTab NÃO entram no barrel — o AdminDashboard as carrega via
// lazy import direto; incluí-las aqui puxaria todo o grafo da loja para quem só
// quer uma aba (e deixava o teste do barrel lento).
