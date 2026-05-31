import React from 'react';
import { CheckCircle2, Clock, AlertCircle, Zap } from 'lucide-react';

interface UserStory {
    id: string;
    titre: string;
    en_tant_que: string;
    je_veux: string;
    afin_de: string;
    criteres_acceptation: string[];
    regles_metier: string[];
    priorite: string;
    estimation: string;
    statut: string;
}

interface Epic {
    id: string;
    nom: string;
    description: string;
    objectif: string;
    user_stories: UserStory[];
}

interface UserStoriesTableProps {
    epics: Epic[];
}

const UserStoriesTable: React.FC<UserStoriesTableProps> = ({ epics }) => {
    // Extraire toutes les user stories de tous les epics
    const allUserStories = epics.flatMap(epic =>
        epic.user_stories.map(us => ({
            ...us,
            epicName: epic.nom,
            epicId: epic.id
        }))
    );

    // Fonction pour obtenir la couleur de la priorité
    const getPriorityColor = (priority: string) => {
        switch (priority.toLowerCase()) {
            case 'haute':
                return 'bg-red-100 text-red-700';
            case 'moyenne':
                return 'bg-yellow-100 text-yellow-700';
            case 'basse':
                return 'bg-green-100 text-green-700';
            default:
                return 'bg-gray-100 text-gray-700';
        }
    };

    // Fonction pour obtenir l'icône et la couleur du statut
    const getStatusDisplay = (status: string) => {
        switch (status.toLowerCase()) {
            case 'terminé':
            case 'terminée':
                return {
                    icon: <CheckCircle2 className="w-4 h-4" />,
                    color: 'text-green-600 bg-green-50',
                    label: 'Terminé'
                };
            case 'en cours':
                return {
                    icon: <Clock className="w-4 h-4" />,
                    color: 'text-blue-600 bg-blue-50',
                    label: 'En cours'
                };
            case 'à faire':
                return {
                    icon: <AlertCircle className="w-4 h-4" />,
                    color: 'text-gray-600 bg-gray-50',
                    label: 'À faire'
                };
            default:
                return {
                    icon: <AlertCircle className="w-4 h-4" />,
                    color: 'text-gray-600 bg-gray-50',
                    label: status
                };
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-900">User Stories</h3>
                        <p className="text-sm text-slate-600 mt-1">
                            {allUserStories.length} user {allUserStories.length > 1 ? 'stories' : 'story'} trouvée{allUserStories.length > 1 ? 's' : ''}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <span className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                            <span className="text-slate-600">Haute</span>
                        </span>
                        <span className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                            <span className="text-slate-600">Moyenne</span>
                        </span>
                        <span className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                            <span className="text-slate-600">Basse</span>
                        </span>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                                ID
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                                Epic
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                                User Story
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                                Priorité
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                                Statut
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                                Estimation
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                                Critères
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {allUserStories.map((us, index) => {
                            const statusDisplay = getStatusDisplay(us.statut);
                            return (
                                <tr key={us.id} className="hover:bg-slate-50 transition-colors">
                                    {/* ID */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <Zap className="w-4 h-4 text-blue-500" />
                                            <span className="text-sm font-medium text-slate-900">{us.id}</span>
                                        </div>
                                    </td>

                                    {/* Epic */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm">
                                            <div className="text-xs text-slate-500">{us.epicId}</div>
                                            <div className="font-medium text-slate-700">{us.epicName}</div>
                                        </div>
                                    </td>

                                    {/* User Story */}
                                    <td className="px-6 py-4">
                                        <div className="max-w-xs">
                                            <div className="text-sm font-medium text-slate-900 mb-1">
                                                {us.titre}
                                            </div>
                                            <div className="text-xs text-slate-600">
                                                <span className="font-medium">En tant que</span> {us.en_tant_que},
                                                <span className="font-medium"> je veux</span> {us.je_veux}
                                            </div>
                                        </div>
                                    </td>

                                    {/* Priorité */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(us.priorite)}`}>
                                            {us.priorite}
                                        </span>
                                    </td>

                                    {/* Statut */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${statusDisplay.color}`}>
                                            {statusDisplay.icon}
                                            {statusDisplay.label}
                                        </div>
                                    </td>

                                    {/* Estimation */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-1.5 text-sm text-slate-700">
                                            <Clock className="w-4 h-4 text-slate-400" />
                                            {us.estimation}
                                        </div>
                                    </td>

                                    {/* Critères d'acceptation */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                                                {us.criteres_acceptation.length}
                                            </span>
                                            <span className="text-xs text-slate-500">critères</span>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {allUserStories.length === 0 && (
                <div className="p-12 text-center">
                    <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">Aucune user story trouvée</p>
                </div>
            )}
        </div>
    );
};

export default UserStoriesTable;