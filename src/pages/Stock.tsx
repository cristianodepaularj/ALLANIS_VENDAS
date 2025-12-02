import React, { useEffect, useState } from 'react';
import { Search, ArrowUpDown, FileSpreadsheet, FileText, Plus, Upload, File } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { StockModal } from '../components/StockModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

interface Product {
    id: string;
    name: string;
    code: string;
    category: string;
    stock_quantity: number;
    min_stock_threshold: number;
    unit: string;
}

interface Purchase {
    id: string;
    product_id: string;
    quantity: number;
    purchase_date: string;
    file_url: string | null;
    product: {
        name: string;
        code: string;
    };
}

const PurchasesView: React.FC<{ products: Product[], onPurchaseAdded: () => void }> = ({ products, onPurchaseAdded }) => {
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [newPurchase, setNewPurchase] = useState({
        product_id: '',
        quantity: 1,
        purchase_date: format(new Date(), 'yyyy-MM-dd'),
        file: null as File | null
    });
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        fetchPurchases();
    }, []);

    const fetchPurchases = async () => {
        try {
            const { data, error } = await supabase
                .from('purchases')
                .select(`
                    *,
                    product:products(name, code)
                `)
                .order('purchase_date', { ascending: false });

            if (error) throw error;
            setPurchases(data || []);
        } catch (error) {
            console.error('Error fetching purchases:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setNewPurchase({ ...newPurchase, file: e.target.files[0] });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setUploading(true);
        try {
            let fileUrl = null;

            if (newPurchase.file) {
                const fileExt = newPurchase.file.name.split('.').pop();
                const fileName = `${Math.random()}.${fileExt}`;
                const { error: uploadError } = await supabase.storage
                    .from('purchase-docs')
                    .upload(fileName, newPurchase.file);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('purchase-docs')
                    .getPublicUrl(fileName);

                fileUrl = publicUrl;
            }

            // Insert purchase
            const { error: insertError } = await supabase
                .from('purchases')
                .insert([{
                    product_id: newPurchase.product_id,
                    quantity: newPurchase.quantity,
                    purchase_date: new Date(newPurchase.purchase_date).toISOString(),
                    file_url: fileUrl
                }]);

            if (insertError) throw insertError;

            // Update stock
            const product = products.find(p => p.id === newPurchase.product_id);
            if (product) {
                const { error: updateError } = await supabase
                    .from('products')
                    .update({ stock_quantity: product.stock_quantity + newPurchase.quantity })
                    .eq('id', newPurchase.product_id);

                if (updateError) throw updateError;
            }

            setShowModal(false);
            setNewPurchase({
                product_id: '',
                quantity: 1,
                purchase_date: format(new Date(), 'yyyy-MM-dd'),
                file: null
            });
            fetchPurchases();
            onPurchaseAdded(); // Refresh products list
            alert('Compra registrada com sucesso!');

        } catch (error) {
            console.error('Error registering purchase:', error);
            alert('Erro ao registrar compra. Verifique se o bucket "purchase-docs" existe no Supabase.');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <button
                    onClick={() => setShowModal(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Nova Compra
                </button>
            </div>

            <div className="bg-white shadow rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Produto</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantidade</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Anexo</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr><td colSpan={4} className="px-6 py-4 text-center">Carregando...</td></tr>
                            ) : purchases.length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-4 text-center">Nenhuma compra registrada</td></tr>
                            ) : (
                                purchases.map(purchase => (
                                    <tr key={purchase.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {format(new Date(purchase.purchase_date), 'dd/MM/yyyy')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {purchase.product?.name}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {purchase.quantity}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
                                            {purchase.file_url ? (
                                                <a href={purchase.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center hover:underline">
                                                    <File className="h-4 w-4 mr-1" />
                                                    Ver Arquivo
                                                </a>
                                            ) : '-'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg max-w-md w-full p-6">
                        <h2 className="text-xl font-bold mb-4">Registrar Compra</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Data</label>
                                <input
                                    type="date"
                                    required
                                    className="mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500"
                                    value={newPurchase.purchase_date}
                                    onChange={e => setNewPurchase({ ...newPurchase, purchase_date: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Produto</label>
                                <select
                                    required
                                    className="mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500"
                                    value={newPurchase.product_id}
                                    onChange={e => setNewPurchase({ ...newPurchase, product_id: e.target.value })}
                                >
                                    <option value="">Selecione um produto</option>
                                    {products.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Quantidade</label>
                                <input
                                    type="number"
                                    required
                                    min="1"
                                    className="mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500"
                                    value={newPurchase.quantity}
                                    onChange={e => setNewPurchase({ ...newPurchase, quantity: parseInt(e.target.value) })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Anexo (NF/Foto)</label>
                                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                                    <div className="space-y-1 text-center">
                                        <Upload className="mx-auto h-12 w-12 text-gray-400" />
                                        <div className="flex text-sm text-gray-600">
                                            <label className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                                                <span>Upload um arquivo</span>
                                                <input type="file" className="sr-only" onChange={handleFileChange} />
                                            </label>
                                        </div>
                                        <p className="text-xs text-gray-500">PNG, JPG, PDF até 10MB</p>
                                        {newPurchase.file && (
                                            <p className="text-sm text-green-600 mt-2">{newPurchase.file.name}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={uploading}
                                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {uploading ? 'Salvando...' : 'Salvar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export const Stock: React.FC = () => {
    const { role } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

    const fetchProducts = async () => {
        try {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .order('name');

            if (error) throw error;
            setProducts(data || []);
        } catch (error) {
            console.error('Error fetching stock:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProducts();
    }, []);

    const handleExportPDF = () => {
        const doc = new jsPDF('landscape');

        doc.text('Relatório de Estoque', 14, 15);

        autoTable(doc, {
            head: [['Código', 'Produto', 'Categoria', 'Estoque Atual', 'Mínimo']],
            body: products.map(p => [
                p.code,
                p.name,
                p.category,
                `${p.stock_quantity} ${p.unit}`,
                p.min_stock_threshold
            ]),
            startY: 20,
        });

        doc.save('estoque.pdf');
    };

    const handleExportXLS = () => {
        const ws = XLSX.utils.json_to_sheet(products.map(p => ({
            Código: p.code,
            Produto: p.name,
            Categoria: p.category,
            Estoque: p.stock_quantity,
            Unidade: p.unit,
            Mínimo: p.min_stock_threshold
        })));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Estoque");
        XLSX.writeFile(wb, "estoque.xlsx");
    };

    const filteredProducts = products.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.category?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const [activeTab, setActiveTab] = useState<'stock' | 'purchases'>('stock');

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-900">Controle de Estoque</h1>
                <div className="flex gap-2">
                    {activeTab === 'stock' && (
                        <>
                            <button
                                onClick={handleExportPDF}
                                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                                title="Exportar PDF"
                            >
                                <FileText className="h-4 w-4 mr-2" />
                                PDF
                            </button>
                            <button
                                onClick={handleExportXLS}
                                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                                title="Exportar Excel"
                            >
                                <FileSpreadsheet className="h-4 w-4 mr-2" />
                                XLS
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setActiveTab('stock')}
                        className={`${activeTab === 'stock'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                    >
                        Estoque Atual
                    </button>
                    <button
                        onClick={() => setActiveTab('purchases')}
                        className={`${activeTab === 'purchases'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                    >
                        Compras
                    </button>
                </nav>
            </div>

            {activeTab === 'stock' ? (
                <div className="bg-white shadow rounded-lg overflow-hidden">
                    <div className="p-4 border-b border-gray-200">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                placeholder="Buscar produtos no estoque..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Produto
                                    </th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Categoria
                                    </th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Estoque Atual
                                    </th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                    {role === 'admin' && (
                                        <th scope="col" className="relative px-6 py-3">
                                            <span className="sr-only">Ações</span>
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                                            Carregando...
                                        </td>
                                    </tr>
                                ) : filteredProducts.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                                            Nenhum produto encontrado
                                        </td>
                                    </tr>
                                ) : (
                                    filteredProducts.map((product) => (
                                        <tr key={product.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">{product.name}</div>
                                                <div className="text-sm text-gray-500">Cód: {product.code}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-900">{product.category}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-bold text-gray-900">
                                                    {product.stock_quantity} {product.unit}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${product.stock_quantity <= product.min_stock_threshold
                                                    ? 'bg-red-100 text-red-800'
                                                    : 'bg-green-100 text-green-800'
                                                    }`}>
                                                    {product.stock_quantity <= product.min_stock_threshold ? 'Baixo Estoque' : 'Normal'}
                                                </span>
                                            </td>
                                            {role === 'admin' && (
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <button
                                                        onClick={() => setSelectedProduct(product)}
                                                        className="text-blue-600 hover:text-blue-900 flex items-center justify-end ml-auto"
                                                    >
                                                        <ArrowUpDown className="h-4 w-4 mr-1" />
                                                        Ajustar
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <PurchasesView products={products} onPurchaseAdded={fetchProducts} />
            )}

            {selectedProduct && (
                <StockModal
                    isOpen={!!selectedProduct}
                    onClose={() => setSelectedProduct(null)}
                    onSuccess={fetchProducts}
                    product={selectedProduct}
                />
            )}
        </div>
    );
};
