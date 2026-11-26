import unittest
from multivar3 import analyze3, MultiVar3Error

class MultiVar3Tests(unittest.TestCase):
    def test_bowl_is_local_minimum(self):
        r = analyze3('x^2 + y^2 + z^2', -2, 2, 15)
        self.assertEqual(r['point_count'], 1)
        self.assertEqual(r['points'][0]['type'], 'local minimum')
        self.assertAlmostEqual(r['points'][0]['value'], 0.0, places=6)

    def test_inverted_bowl_is_local_maximum(self):
        r = analyze3('-x^2 - y^2 - z^2', -2, 2, 15)
        self.assertEqual(r['points'][0]['type'], 'local maximum')

    def test_saddle_is_classified(self):
        r = analyze3('x^2 + y^2 - z^2', -2, 2, 15)
        self.assertEqual(r['points'][0]['type'], 'saddle point')

    def test_unknown_variable_rejected(self):
        with self.assertRaises(MultiVar3Error):
            analyze3('x^2 + y^2 + q^2', -2, 2, 15)

    def test_3d_and_4d_data_returned(self):
        r = analyze3('x^2 + y^2 + z^2', -2, 2, 15)
        self.assertEqual(len(r['surface3d']['z']), 15)
        self.assertEqual(len(r['field4d']['slices']), 9)

if __name__ == '__main__':
    unittest.main(verbosity=2)
