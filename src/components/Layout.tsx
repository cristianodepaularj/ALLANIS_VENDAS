import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    LayoutDashboard,
    Users,
    Package,
    ShoppingCart,
    LogOut,
    Menu,
    X,
    Boxes,
    CreditCard,
    DollarSign,
    History as HistoryIcon
} from 'lucide-react';
import { clsx } from 'clsx';

export const Layout: React.FC = () => {
    const { signOut, role, user } = useAuth();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

    const handleSignOut = async () => {
        await signOut();
    };

    const navigation = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['admin', 'user'] },
        { name: 'Vendas', href: '/sales', icon: ShoppingCart, roles: ['admin', 'user'] },
        { name: 'Parcelas', href: '/installments', icon: CreditCard, roles: ['admin', 'user'] },
        { name: 'Clientes', href: '/clients', icon: Users, roles: ['admin', 'user'] },
        { name: 'Produtos', href: '/products', icon: Package, roles: ['admin', 'user'] },
        { name: 'Estoque', href: '/stock', icon: Boxes, roles: ['admin', 'user'] },
        { name: 'Caixa', href: '/cash-flow', icon: DollarSign, roles: ['admin', 'user'] },
        { name: 'Histórico', href: '/sales-history', icon: HistoryIcon, roles: ['admin', 'user'] },
    ];

    const filteredNavigation = navigation.filter(item => item.roles.includes(role || 'user'));

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Mobile menu overlay */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 md:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div className={clsx(
                "fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:inset-auto",
                isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between h-16 px-4 border-b">
                        <h1 className="text-xl font-bold text-gray-900">SalesManager</h1>
                        <button
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="md:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
                        >
                            <X className="h-6 w-6" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto py-4">
                        <nav className="px-2 space-y-1">
                            {filteredNavigation.map((item) => {
                                const isActive = location.pathname === item.href;
                                return (
                                    <Link
                                        key={item.name}
                                        to={item.href}
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className={clsx(
                                            isActive
                                                ? 'bg-blue-50 text-blue-700'
                                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                                            'group flex items-center px-2 py-2 text-sm font-medium rounded-md'
                                        )}
                                    >
                                        <item.icon
                                            className={clsx(
                                                isActive ? 'text-blue-700' : 'text-gray-400 group-hover:text-gray-500',
                                                'mr-3 flex-shrink-0 h-6 w-6'
                                            )}
                                        />
                                        {item.name}
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>

                    <div className="p-4 border-t">
                        <div className="flex items-center mb-4">
                            <div className="ml-3">
                                <p className="text-sm font-medium text-gray-700">{user?.email}</p>
                                <p className="text-xs text-gray-500 capitalize">{role}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleSignOut}
                            className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                            <LogOut className="mr-2 h-4 w-4" />
                            Sair
                        </button>
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white shadow-sm md:hidden">
                    <div className="flex items-center justify-between h-16 px-4">
                        <button
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
                        >
                            <Menu className="h-6 w-6" />
                        </button>
                        <h1 className="text-lg font-semibold text-gray-900">SalesManager</h1>
                        <div className="w-10" /> {/* Spacer for centering */}
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 md:p-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
